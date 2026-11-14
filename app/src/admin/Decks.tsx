import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorText } from '../lib/api';
import { readCardFile, expandRows, compressImage, blobToBase64, imageRefs, normalizeImages, type ParsedFile, type Row } from '../lib/cardfile';
import { renderCard, plain } from '../lib/render';
import type { Card } from '../lib/store';
import { Modal, rel, type AdminCtx } from './Admin';

type Deck = { id: string; name: string; description: string; position: number; updated_at: string; cards: number; images: number };

export default function Decks({ ctx }: { ctx: AdminCtx }) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [err, setErr] = useState('');
  const [upload, setUpload] = useState(false);
  const [browse, setBrowse] = useState<Deck | null>(null);
  const [editDeck, setEditDeck] = useState<Deck | null>(null);
  const [help, setHelp] = useState(false);

  const load = useCallback(() => {
    ctx.call<Deck[]>('admin_list_decks').then(setDecks).catch((e) => setErr(errorText(e)));
  }, [ctx.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <button className="link small" onClick={() => setHelp(true)}>شكل ملف البطاقات</button>
        <button className="btn" onClick={() => setUpload(true)}>رفع ملف بطاقات</button>
      </div>
      {err && <div className="notice err">{err}</div>}
      <div className="panel table-wrap">
        {!decks ? <div style={{ padding: 24 }}><div className="spinner" /></div> : decks.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center' }} className="stack-sm">
            <b style={{ fontWeight: 600 }}>لا توجد مواد بعد</b>
            <p className="muted small">ارفع ملف البطاقات الذي جهّزته مع Claude، وستظهر للطلاب فوراً.</p>
          </div>
        ) : (
          <table className="t">
            <thead><tr><th>المادة</th><th>البطاقات</th><th>الصور</th><th>آخر تحديث</th><th></th></tr></thead>
            <tbody>
              {decks.map((d) => (
                <tr key={d.id}>
                  <td><b style={{ fontWeight: 600 }}>{d.name}</b>{d.description && <span className="faint small"> {d.description}</span>}</td>
                  <td className="num">{d.cards}</td>
                  <td className="num">{d.images}</td>
                  <td>{rel(d.updated_at)}</td>
                  <td>
                    <div className="row" style={{ gap: 14 }}>
                      <button className="link small" onClick={() => setBrowse(d)}>عرض البطاقات</button>
                      <button className="link small" onClick={() => setEditDeck(d)}>تعديل</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {upload && <Upload ctx={ctx} decks={decks ?? []} onClose={() => { setUpload(false); load(); }} />}
      {browse && <Browse ctx={ctx} deck={browse} onClose={() => { setBrowse(null); load(); }} />}
      {editDeck && <EditDeck ctx={ctx} deck={editDeck} onClose={() => { setEditDeck(null); load(); }} />}
      {help && <FormatHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- upload
type Group = { name: string; existing?: Deck; rows: Row[] };

function Upload({ ctx, decks, onClose }: { ctx: AdminCtx; decks: Deck[]; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [target, setTarget] = useState<string>(decks[0]?.id ?? 'new');
  const [newName, setNewName] = useState('');
  const [replace, setReplace] = useState(true);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; text: string } | null>(null);
  const [result, setResult] = useState<string[] | null>(null);
  const [err, setErr] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setFile(f); setParsed(null); setResult(null);
    try {
      const p = await readCardFile(f);
      setParsed(p);
      if (!newName) setNewName(f.name.replace(/\.(zip|csv|tsv|txt)$/i, ''));
    } catch (e) { setErr('تعذّرت قراءة الملف: ' + String((e as Error).message ?? e)); }
  };

  const fileHasDecks = !!parsed?.rows.some((r) => r.deck?.trim());
  const groups: Group[] = useMemo(() => {
    if (!parsed) return [];
    if (fileHasDecks) {
      const m = new Map<string, Row[]>();
      for (const r of parsed.rows) {
        const n = r.deck?.trim() || newName || 'بدون اسم';
        if (!m.has(n)) m.set(n, []);
        m.get(n)!.push(r);
      }
      return [...m.entries()].map(([name, rows]) => ({ name, rows, existing: decks.find((d) => d.name === name) }));
    }
    const ex = decks.find((d) => d.id === target);
    return [{ name: ex ? ex.name : newName.trim(), existing: ex, rows: parsed.rows }];
  }, [parsed, fileHasDecks, target, newName, decks]);

  const missing = useMemo(() => {
    if (!parsed) return [];
    const s = new Set<string>();
    for (const r of parsed.rows) for (const ref of imageRefs(normalizeImages(`${r.front}\n${r.back ?? ''}`))) {
      if (!parsed.images.has(ref.split('/').pop()!.toLowerCase())) s.add(ref);
    }
    return [...s];
  }, [parsed]);

  const [previewCards, setPreviewCards] = useState<Card[]>([]);
  useEffect(() => {
    if (!parsed) return;
    expandRows(parsed.rows.slice(0, 6), 'preview').then((cs) => setPreviewCards(cs.slice(0, 3).map((c) => ({ ...c, deck_id: '' }))));
  }, [parsed]);
  const previewMedia = useMemo(() => {
    const m = new Map<string, string>();
    parsed?.images.forEach((b, k) => m.set(k, URL.createObjectURL(b)));
    return m;
  }, [parsed]);
  const previewMediaLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of previewCards) for (const ref of imageRefs(c.front + '\n' + c.back)) {
      const u = previewMedia.get(ref.split('/').pop()!.toLowerCase());
      if (u) m.set(ref, u);
    }
    return m;
  }, [previewCards, previewMedia]);

  const start = async () => {
    if (!parsed) return;
    if (groups.some((g) => !g.name)) { setErr('اكتب اسم المادة.'); return; }
    setBusy(true); setErr('');
    const log: string[] = [];
    try {
      let totalCards = 0;
      const plan = await Promise.all(groups.map(async (g) => ({ g, cards: await expandRows(g.rows, g.name) })));
      totalCards = plan.reduce((a, p) => a + p.cards.length, 0);
      const totalImgs = new Set(groups.flatMap((g) => g.rows.flatMap((r) => imageRefs(normalizeImages(`${r.front}\n${r.back ?? ''}`))))).size;
      const total = totalCards + totalImgs;
      let done = 0;
      setProgress({ done, total, text: 'تجهيز…' });

      for (const { g } of plan) {
        let deckId = g.existing?.id;
        if (!deckId) {
          deckId = (await ctx.call<{ id: string }>('admin_save_deck', { p_id: null, p_name: g.name, p_description: '', p_position: null })).id;
        }
        // images: compress, upload, and point the card text at the stored copy
        const rename = new Map<string, string>();
        const refs = new Set(g.rows.flatMap((r) => imageRefs(normalizeImages(`${r.front}\n${r.back ?? ''}`))));
        let batch: { name: string; mime: string; data: string }[] = [];
        let batchSize = 0;
        const flush = async () => {
          if (!batch.length) return;
          await ctx.call('admin_upsert_media', { p_items: batch });
          batch = []; batchSize = 0;
        };
        for (const ref of refs) {
          const base = ref.split('/').pop()!.toLowerCase();
          const blob = parsed.images.get(base);
          done++;
          if (!blob) continue;
          setProgress({ done, total, text: `صورة ${base}` });
          const { blob: small, ext } = await compressImage(blob, base);
          const stored = `${deckId}/${base.replace(/\.[^.]+$/, '')}.${ext}`;
          rename.set(ref, stored);
          const data = await blobToBase64(small);
          const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'gif' ? 'image/gif' : ext === 'jpg' ? 'image/jpeg' : 'image/webp';
          batch.push({ name: stored, mime, data });
          batchSize += data.length;
          if (batchSize > 1_500_000) await flush();
        }
        await flush();

        const rows = g.rows.map((r) => {
          const fix = (s: string) => normalizeImages(s).replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, ref) => rename.has(ref.trim()) ? `![${alt}](${rename.get(ref.trim())})` : m);
          return { ...r, front: fix(r.front), back: fix(r.back ?? '') };
        });
        const cards = await expandRows(rows, g.name);
        let changed = 0;
        for (let i = 0; i < cards.length; i += 300) {
          const part = cards.slice(i, i + 300);
          changed += (await ctx.call<{ changed: number }>('admin_upsert_cards', { p_deck_id: deckId, p_cards: part })).changed;
          done += part.length;
          setProgress({ done, total, text: `${g.name}: ${Math.min(i + 300, cards.length)} من ${cards.length}` });
        }
        let removed = 0;
        if (replace && g.existing) {
          removed = (await ctx.call<{ removed: number }>('admin_prune_deck', { p_deck_id: deckId, p_keep_ids: cards.map((c) => c.id) })).removed;
        }
        log.push(`${g.name}: ${cards.length} بطاقة، منها ${changed} جديدة أو معدّلة${removed ? `، وحُذفت ${removed}` : ''}.`);
      }
      setResult(log);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  return (
    <Modal onClose={() => !busy && onClose()}>
      <h2 style={{ fontSize: 19 }}>رفع ملف بطاقات</h2>
      {result ? (
        <>
          <div className="notice ok stack-sm">{result.map((l, i) => <p key={i}>{l}</p>)}</div>
          <p className="small muted">ستظهر التغييرات للطلاب في المزامنة التالية (عند فتح التطبيق مع اتصال بالإنترنت).</p>
          <button className="btn" onClick={onClose}>تم</button>
        </>
      ) : (
        <>
          <label
            className={'drop' + (over ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          >
            <input type="file" accept=".zip,.csv,.tsv,.txt" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <b style={{ fontWeight: 600 }}>{file ? file.name : 'اختر ملفاً أو اسحبه هنا'}</b>
            <p className="small muted">ملف ‎.zip‎ (بطاقات مع صور) أو ‎.csv‎ / ‎.txt‎</p>
          </label>

          {parsed && (
            <>
              <div className="small">
                <b className="num" style={{ fontWeight: 600 }}>{parsed.rows.length}</b> سطر بطاقات، و<b className="num" style={{ fontWeight: 600 }}>{parsed.images.size}</b> صورة.
              </div>
              {parsed.warnings.map((w, i) => <div key={i} className="notice">{w}</div>)}
              {missing.length > 0 && <div className="notice">صور مذكورة في البطاقات وغير موجودة في الملف: <span className="ltr">{missing.slice(0, 6).join('، ')}</span></div>}

              {fileHasDecks ? (
                <div className="small stack-sm">
                  <p className="muted">الملف يحدّد المواد بنفسه:</p>
                  {groups.map((g) => <p key={g.name}>• {g.name} <span className="faint">({g.rows.length} سطر، {g.existing ? 'تحديث مادة موجودة' : 'مادة جديدة'})</span></p>)}
                </div>
              ) : (
                <div className="stack-sm">
                  <label className="label">أين تُضاف البطاقات؟</label>
                  <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
                    {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    <option value="new">مادة جديدة…</option>
                  </select>
                  {target === 'new' && <input className="field" placeholder="اسم المادة" value={newName} onChange={(e) => setNewName(e.target.value)} />}
                </div>
              )}

              {groups.some((g) => g.existing) && (
                <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ width: 20, height: 20, marginTop: 3 }} />
                  <span className="small">هذا الملف هو النسخة الكاملة للمادة: احذف البطاقات غير الموجودة فيه.<br />
                    <span className="faint">تقدّم الطلاب على البطاقات المتبقية يبقى محفوظاً.</span></span>
                </label>
              )}

              {previewCards.length > 0 && (
                <div className="stack-sm">
                  <p className="label">معاينة</p>
                  {previewCards.map((c) => (
                    <div key={c.id} className="preview-card content" dangerouslySetInnerHTML={{ __html: renderCard(c, 'back', previewMediaLookup) }} />
                  ))}
                </div>
              )}
            </>
          )}

          {progress && (
            <div className="stack-sm">
              <div className="progress"><i style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
              <p className="tiny faint">{progress.text}</p>
            </div>
          )}
          {err && <div className="notice err">{err}</div>}
          <div className="row">
            <button className="btn" disabled={!parsed || !parsed.rows.length || busy} onClick={start}>{busy ? 'جاري الرفع…' : 'رفع ونشر'}</button>
            <button className="btn light" disabled={busy} onClick={onClose}>إلغاء</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- browse / edit cards
function Browse({ ctx, deck, onClose }: { ctx: AdminCtx; deck: Deck; onClose: () => void }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Card | null>(null);
  const [media, setMedia] = useState(new Map<string, string>());
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    ctx.call<Card[]>('admin_list_cards', { p_deck_id: deck.id }).then(setCards).catch((e) => setErr(errorText(e)));
  }, [deck.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  // notes: show one row per note (cloze siblings share text)
  const notes = useMemo(() => {
    const seen = new Set<string>();
    return (cards ?? []).filter((c) => {
      const k = c.kind === 'cloze' ? c.id.replace(/-c\d+$/, '') : c.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return !q || (c.front + c.back).toLowerCase().includes(q.toLowerCase());
    });
  }, [cards, q]);

  useEffect(() => {
    if (!edit) return;
    const names = imageRefs(edit.front + '\n' + edit.back).filter((n) => !media.has(n));
    if (!names.length) return;
    ctx.call<{ name: string; mime: string; data: string }[]>('admin_get_media', { p_names: names }).then((items) => {
      const m = new Map(media);
      for (const it of items) m.set(it.name, `data:${it.mime};base64,${it.data}`);
      setMedia(m);
    }).catch(() => {});
  }, [edit]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal onClose={onClose}>
      <div className="row between">
        <h2 style={{ fontSize: 19 }}>{deck.name}</h2>
        <button className="link small" onClick={onClose}>إغلاق</button>
      </div>
      {err && <div className="notice err">{err}</div>}
      {edit ? (
        <EditCard ctx={ctx} card={edit} media={media} onDone={() => { setEdit(null); load(); }} />
      ) : (
        <>
          <input className="field" style={{ minHeight: 44 }} placeholder="ابحث في البطاقات" value={q} onChange={(e) => setQ(e.target.value)} />
          {!cards ? <div className="spinner" /> : (
            <div className="stack-sm" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              {notes.map((c) => (
                <button key={c.id} className="list-row" style={{ width: '100%', textAlign: 'start', background: 'var(--bg)', borderRadius: 12 }} onClick={() => setEdit(c)}>
                  <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plain(c.front)}</span>
                  {c.kind === 'cloze' && <span className="pill">فراغات</span>}
                </button>
              ))}
              {notes.length === 0 && <p className="small faint">لا توجد نتائج.</p>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function EditCard({ ctx, card, media, onDone }: { ctx: AdminCtx; card: Card; media: Map<string, string>; onDone: () => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const siblings = card.kind === 'cloze';
  const base = card.id.replace(/-c\d+$/, '');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (siblings) {
        // re-create cloze cards so new/removed {{cN::}} are handled
        const rows = (await expandRows([{ id: base, front, back, tags: card.tags }], '')).map((r) => ({ ...r, position: card.position }));
        await ctx.call('admin_upsert_cards', { p_deck_id: card.deck_id, p_cards: rows });
      } else {
        await ctx.call('admin_update_card', { p_id: card.id, p_front: front, p_back: back });
      }
      onDone();
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { await ctx.call('admin_delete_card', { p_id: card.id }); onDone(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  const previewCard: Card = { ...card, front, back, cloze_ord: card.cloze_ord ?? 1 };

  return (
    <div className="stack">
      <div>
        <label className="label">{siblings ? 'النص (مع الفراغات)' : 'السؤال'}</label>
        <textarea dir="auto" className="field" rows={4} value={front} onChange={(e) => setFront(e.target.value)} />
      </div>
      <div>
        <label className="label">{siblings ? 'ملاحظة إضافية تظهر مع الإجابة' : 'الإجابة'}</label>
        <textarea dir="auto" className="field" rows={4} value={back} onChange={(e) => setBack(e.target.value)} />
      </div>
      <div className="preview-card content" dangerouslySetInnerHTML={{ __html: renderCard(previewCard, 'back', media) }} />
      {err && <div className="notice err">{err}</div>}
      <div className="row between">
        <div className="row">
          <button className="btn" disabled={busy} onClick={save}>حفظ</button>
          <button className="btn light" disabled={busy} onClick={onDone}>رجوع</button>
        </div>
        {!siblings && (confirmDel
          ? <button className="btn danger small-btn" disabled={busy} onClick={del}>تأكيد الحذف</button>
          : <button className="link small" style={{ color: 'var(--again)' }} onClick={() => setConfirmDel(true)}>حذف البطاقة</button>)}
      </div>
    </div>
  );
}

function EditDeck({ ctx, deck, onClose }: { ctx: AdminCtx; deck: Deck; onClose: () => void }) {
  const [name, setName] = useState(deck.name);
  const [desc, setDesc] = useState(deck.description);
  const [pos, setPos] = useState(deck.position);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true);
    try { await ctx.call(fn, args); onClose(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19 }}>تعديل المادة</h2>
      <div><label className="label">الاسم</label><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="label">وصف قصير (اختياري)</label><input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div><label className="label">الترتيب في القائمة</label><input type="number" className="field" value={pos} onChange={(e) => setPos(Number(e.target.value))} /></div>
      {err && <div className="notice err">{err}</div>}
      <div className="row between">
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run('admin_save_deck', { p_id: deck.id, p_name: name, p_description: desc, p_position: pos })}>حفظ</button>
          <button className="btn light" onClick={onClose}>إلغاء</button>
        </div>
        {confirmDel
          ? <button className="btn danger small-btn" disabled={busy} onClick={() => run('admin_delete_deck', { p_id: deck.id })}>حذف المادة نهائياً</button>
          : <button className="link small" style={{ color: 'var(--again)' }} onClick={() => setConfirmDel(true)}>حذف المادة</button>}
      </div>
    </Modal>
  );
}

const SAMPLE = `id,type,front,back,tags
cardio-001,basic,What is the most common cause of mitral stenosis?,**Rheumatic heart disease**,cardio
cardio-002,cloze,"Normal PR interval: {{c1::0.12–0.20 s}}. Normal QRS: {{c2::< 0.12 s}}.",,cardio ecg
cardio-003,basic,"Identify the rhythm:
![](ecg1.png)","**Atrial fibrillation**
- Irregularly irregular
- No P waves",ecg
`;

function FormatHelp({ onClose }: { onClose: () => void }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + SAMPLE], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'cards.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19 }}>شكل ملف البطاقات</h2>
      <p className="small muted">Claude يجهّز لك هذا الملف تلقائياً. هذه التفاصيل للمرجع فقط.</p>
      <ul className="small stack-sm" style={{ paddingInlineStart: 18, margin: 0 }}>
        <li>ملف <span className="code-tag">cards.csv</span> بالأعمدة: <span className="ltr code-tag">id, type, front, back, tags</span> وعمود <span className="ltr code-tag">deck</span> اختياري.</li>
        <li><b>type</b>: <span className="ltr">basic</span> (سؤال وجواب) أو <span className="ltr">cloze</span> (فراغات).</li>
        <li>الفراغات: <span className="ltr code-tag">{'{{c1::الجواب}}'}</span>، ومع تلميح: <span className="ltr code-tag">{'{{c1::الجواب::تلميح}}'}</span>.</li>
        <li>تنسيق: <span className="ltr code-tag">**غامق**</span> و<span className="ltr code-tag">==تظليل==</span> وسطر يبدأ بـ <span className="ltr code-tag">- </span> لقائمة.</li>
        <li>صورة: <span className="ltr code-tag">![](image.png)</span>، وضع الصور مع <span className="code-tag">cards.csv</span> في ملف ‎.zip‎ واحد.</li>
        <li>عمود <b>id</b> يجعل التحديث لاحقاً يحافظ على تقدّم الطلاب. لا تغيّره بعد النشر.</li>
      </ul>
      <div className="row">
        <button className="btn light small-btn" onClick={download}>تنزيل ملف مثال</button>
        <button className="btn small-btn" onClick={onClose}>تم</button>
      </div>
    </Modal>
  );
}
