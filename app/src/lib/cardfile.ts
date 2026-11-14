// Reading card files (zip / csv / tsv / txt) and turning rows into cards.
import Papa from 'papaparse';

export type Row = { id?: string; deck?: string; type?: string; front: string; back?: string; tags?: string };
export type CardIn = {
  id: string; kind: 'basic' | 'cloze'; front: string; back: string;
  cloze_ord: number | null; tags: string; position: number;
};

const CLOZE_RE = /\{\{c(\d+)::/g;

async function shortHash(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 7).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Anki-style <img src="x.png"> → ![](x.png) */
export function normalizeImages(s: string) {
  return (s ?? '').replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '![]($1)').replace(/<br\s*\/?>/gi, '\n');
}

export function imageRefs(s: string): string[] {
  return [...(s ?? '').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1].trim());
}

export async function expandRows(rows: Row[], deckName: string): Promise<CardIn[]> {
  const out: CardIn[] = [];
  let pos = 0;
  for (const r of rows) {
    const front = normalizeImages(r.front ?? '').trim();
    if (!front) continue;
    const back = normalizeImages(r.back ?? '').trim();
    const noteId = (r.id ?? '').trim() || 'h' + (await shortHash(deckName + '|' + front));
    const ords = [...new Set([...front.matchAll(CLOZE_RE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    const isCloze = (r.type ?? '').toLowerCase().startsWith('cloze') || ords.length > 0;
    if (isCloze && ords.length) {
      for (const o of ords) {
        out.push({ id: `${noteId}-c${o}`, kind: 'cloze', front, back, cloze_ord: o, tags: r.tags ?? '', position: pos++ });
      }
    } else {
      out.push({ id: noteId, kind: 'basic', front, back, cloze_ord: null, tags: r.tags ?? '', position: pos++ });
    }
  }
  return out;
}

function parseTable(text: string, nameHint: string): { rows: Row[]; warnings: string[] } {
  const warnings: string[] = [];
  text = text.replace(/^﻿/, '');
  // Skip Anki export header lines like "#separator:tab"
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[0].startsWith('#')) lines.shift();
  text = lines.join('\n');
  const delimiter = /\.(tsv|txt)$/i.test(nameHint) ? '\t' : '';
  const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: 'greedy' });
  const data = parsed.data as string[][];
  if (!data.length) return { rows: [], warnings: ['الملف فارغ.'] };
  const head = data[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.includes('front');
  const col = (n: string) => head.indexOf(n);
  const rows: Row[] = [];
  const body = hasHeader ? data.slice(1) : data;
  for (const r of body) {
    if (hasHeader) {
      rows.push({
        id: r[col('id')] ?? '', deck: r[col('deck')] ?? '', type: r[col('type')] ?? '',
        front: r[col('front')] ?? '', back: r[col('back')] ?? '', tags: r[col('tags')] ?? '',
      });
    } else {
      rows.push({ front: r[0] ?? '', back: r[1] ?? '', tags: r[2] ?? '' });
    }
  }
  if (!hasHeader) warnings.push('لم يتم العثور على عناوين أعمدة؛ تم اعتبار العمود الأول سؤالاً والثاني جواباً.');
  return { rows, warnings };
}

export type ParsedFile = { rows: Row[]; images: Map<string, Blob>; warnings: string[] };

export async function readCardFile(file: File): Promise<ParsedFile> {
  const images = new Map<string, Blob>();
  if (/\.zip$/i.test(file.name)) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith('__MACOSX'));
    const table = entries.find((f) => /(^|\/)cards\.(csv|tsv|txt)$/i.test(f.name))
      ?? entries.find((f) => /\.(csv|tsv|txt)$/i.test(f.name));
    if (!table) return { rows: [], images, warnings: ['لا يوجد ملف cards.csv داخل الملف المضغوط.'] };
    for (const f of entries) {
      if (/\.(png|jpe?g|webp|gif|svg)$/i.test(f.name)) {
        const base = f.name.split('/').pop()!.toLowerCase();
        const type = /svg$/i.test(base) ? 'image/svg+xml' : /gif$/i.test(base) ? 'image/gif' : '';
        images.set(base, new Blob([await f.async('arraybuffer')], type ? { type } : {}));
      }
    }
    const { rows, warnings } = parseTable(await table.async('string'), table.name);
    return { rows, images, warnings };
  }
  const { rows, warnings } = parseTable(await file.text(), file.name);
  return { rows, images, warnings };
}

/** Shrinks photos so they load fast and fit offline. */
export async function compressImage(blob: Blob, name: string): Promise<{ blob: Blob; ext: string }> {
  if (/\.(svg|gif)$/i.test(name)) return { blob, ext: name.split('.').pop()!.toLowerCase() };
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const max = 1400;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const webp = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.82));
    if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
    const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.84));
    return { blob: jpg!, ext: 'jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
