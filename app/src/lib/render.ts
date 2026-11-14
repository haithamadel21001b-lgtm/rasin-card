// Turns card text into safe HTML.
// Supported: **bold**, *italic*, ==highlight==, "- " bullet lines, ![](image), {{c1::cloze::hint}}
import type { Card } from './store';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function inline(s: string) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<i>$2</i>');
}

function blocks(text: string, tokens: string[]) {
  const restore = (h: string) => h.replace(/\u0001(\d+)\u0002/g, (_, i) => tokens[Number(i)]);
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul dir="auto">${list.join('')}</ul>`); list = []; } };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^[-•*]\s+(.*)$/);
    if (m) { list.push(`<li dir="auto">${restore(inline(m[1]))}</li>`); continue; }
    flush();
    if (!line) continue;
    out.push(`<p dir="auto">${restore(inline(line))}</p>`);
  }
  flush();
  return out.join('');
}

export type Side = 'front' | 'back';

export function renderText(text: string, opts: { side: Side; ord?: number | null; media: Map<string, string> }) {
  const tokens: string[] = [];
  const tok = (html: string) => { tokens.push(html); return `\u0001${tokens.length - 1}\u0002`; };
  let s = text.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_, name) => {
    const url = opts.media.get(name.trim());
    return tok(url ? `<img src="${url}" alt="" draggable="false">` : `<span class="img-missing">صورة غير متوفرة بعد</span>`);
  });
  s = s.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_, n, ans, hint) => {
    const target = Number(n) === opts.ord;
    if (!target) return tok(`<span class="cz-other">${inline(ans)}</span>`);
    if (opts.side === 'front') return tok(`<span class="cz">${hint ? esc(hint) : '…'}</span>`);
    return tok(`<span class="cz cz-open">${inline(ans)}</span>`);
  });
  return blocks(s, tokens);
}

export function imageNames(card: Card) {
  return [...`${card.front}\n${card.back}`.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1].trim());
}

export function renderCard(card: Card, side: Side, media: Map<string, string>) {
  if (card.kind === 'cloze') {
    const main = renderText(card.front, { side, ord: card.cloze_ord, media });
    const extra = side === 'back' && card.back ? `<div class="extra">${renderText(card.back, { side, media })}</div>` : '';
    return main + extra;
  }
  if (side === 'front') return renderText(card.front, { side, media });
  return `<div class="q-echo">${renderText(card.front, { side, media })}</div><div class="answer">${renderText(card.back, { side, media })}</div>`;
}

/** Plain preview for lists */
export function plain(text: string) {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '🖼').replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '[$1]')
    .replace(/\*\*|==/g, '').replace(/\n+/g, ' ').trim();
}
