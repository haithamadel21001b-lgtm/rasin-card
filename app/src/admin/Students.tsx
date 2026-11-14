import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorText } from '../lib/api';
import { Modal, rel, fmtDate, dash, type AdminCtx } from './Admin';

type Code = {
  code: string; label: string; expires_at: string; max_devices: number; active: boolean; created_at: string;
  devices: { name: string; last_seen: string }[]; last_seen: string | null;
  reviews_total: number; reviews_7d: number; again_7d: number; seconds_7d: number; seconds_total: number;
  learned: number; active_days: string[];
};

function streakOf(days: string[]) {
  const set = new Set(days.map((d) => d.slice(0, 10)));
  const k = (d: Date) => d.toISOString().slice(0, 10);
  const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
  const cur = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  if (!set.has(k(cur))) cur.setUTCDate(cur.getUTCDate() - 1);
  let n = 0;
  while (set.has(k(cur))) { n++; cur.setUTCDate(cur.getUTCDate() - 1); }
  return n;
}

function statusOf(c: Code): [string, string] {
  if (!c.active) return ['موقوف', 'red'];
  if (new Date(c.expires_at) < new Date()) return ['منتهي', 'red'];
  if (!c.devices.length) return ['لم يدخل بعد', 'gold'];
  return ['فعّال', 'green'];
}

const inSixMonths = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
};

export default function Students({ ctx }: { ctx: AdminCtx }) {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<Code | null>(null);
  const [created, setCreated] = useState<{ code: string; label: string }[] | null>(null);

  const load = useCallback(() => {
    ctx.call<Code[]>('admin_list_codes').then(setCodes).catch((e) => setErr(errorText(e)));
  }, [ctx.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  const list = useMemo(() => (codes ?? []).filter((c) =>
    !q || c.label.toLowerCase().includes(q.toLowerCase()) || c.code.includes(q.toUpperCase().replace(/[^A-Z0-9]/g, ''))), [codes, q]);

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <input className="field" style={{ maxWidth: 320, minHeight: 44 }} placeholder="ابحث بالاسم أو الرمز" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setCreating(true)}>إنشاء رموز دخول</button>
      </div>
      {err && <div className="notice err">{err}</div>}

      <div className="panel table-wrap">
        {!codes ? <div style={{ padding: 24 }}><div className="spinner" /></div> : codes.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center' }} className="stack-sm">
            <b style={{ fontWeight: 600 }}>لا يوجد طلاب بعد</b>
            <p className="muted small">أنشئ رمز دخول لكل طالب، ثم أرسله له. يدخل الطالب الرمز مرة واحدة على هاتفه.</p>
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>الطالب</th><th>الرمز</th><th>الحالة</th><th>الأجهزة</th><th>آخر نشاط</th>
                <th>وقت الدراسة (7 أيام)</th><th>مراجعات (7 أيام)</th><th>نسبة التذكّر</th><th>تعلّم</th><th>أيام متتالية</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const [st, color] = statusOf(c);
                const recall = c.reviews_7d ? Math.round(((c.reviews_7d - c.again_7d) / c.reviews_7d) * 100) + '%' : '—';
                return (
                  <tr key={c.code} className={c.active ? '' : 'off'}>
                    <td><b style={{ fontWeight: 600 }}>{c.label || <span className="faint">بدون اسم</span>}</b></td>
                    <td><span className="code-tag">{dash(c.code)}</span></td>
                    <td><span className={'pill ' + color}>{st}</span></td>
                    <td className="num">{c.devices.length}/{c.max_devices}</td>
                    <td>{rel(c.last_seen)}</td>
                    <td className="num">{Math.round(c.seconds_7d / 60)} د</td>
                    <td className="num">{c.reviews_7d}</td>
                    <td className="num">{recall}</td>
                    <td className="num">{c.learned}</td>
                    <td className="num">{streakOf(c.active_days)}</td>
                    <td><button className="link small" onClick={() => setEdit(c)}>إدارة</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {creating && <CreateCodes ctx={ctx} onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); setCreated(r); load(); }} />}
      {created && <CreatedList list={created} onClose={() => setCreated(null)} />}
      {edit && <EditCode ctx={ctx} c={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function CreateCodes({ ctx, onClose, onDone }: { ctx: AdminCtx; onClose: () => void; onDone: (r: { code: string; label: string }[]) => void }) {
  const [names, setNames] = useState('');
  const [count, setCount] = useState(1);
  const [expires, setExpires] = useState(inSixMonths());
  const [maxDev, setMaxDev] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const labels = names.split('\n').map((s) => s.trim()).filter(Boolean);
  const n = labels.length || count;

  const go = async () => {
    setBusy(true); setErr('');
    try {
      const r = await ctx.call<{ code: string; label: string }[]>('admin_create_codes', {
        p_count: n, p_labels: labels, p_expires_at: new Date(expires + 'T23:59:59').toISOString(), p_max_devices: maxDev,
      });
      onDone(r);
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19 }}>إنشاء رموز دخول</h2>
      <div>
        <label className="label">أسماء الطلاب، اسم في كل سطر</label>
        <textarea className="field" rows={5} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'علي حسين\nسارة أحمد'} />
        <p className="tiny faint" style={{ marginTop: 4 }}>اترك الحقل فارغاً إذا أردت رموزاً بدون أسماء.</p>
      </div>
      {!labels.length && (
        <div>
          <label className="label">عدد الرموز</label>
          <input type="number" min={1} max={500} className="field" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
        </div>
      )}
      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="label">صالحة حتى</label>
          <input type="date" className="field" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div style={{ width: 130 }}>
          <label className="label">أجهزة لكل رمز</label>
          <input type="number" min={1} max={5} className="field" value={maxDev} onChange={(e) => setMaxDev(Number(e.target.value) || 1)} />
        </div>
      </div>
      {err && <div className="notice err">{err}</div>}
      <div className="row">
        <button className="btn" disabled={busy || n < 1} onClick={go}>{busy ? 'جاري الإنشاء…' : `إنشاء ${n} ${n === 1 ? 'رمز' : 'رموز'}`}</button>
        <button className="btn light" onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

function CreatedList({ list, onClose }: { list: { code: string; label: string }[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = list.map((x) => (x.label ? `${x.label}: ${dash(x.code)}` : dash(x.code))).join('\n');
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19 }}>تم إنشاء {list.length} {list.length === 1 ? 'رمز' : 'رموز'}</h2>
      <p className="small muted">أرسل لكل طالب رمزه فقط. يمكنك نسخ القائمة كاملة.</p>
      <div className="panel" style={{ boxShadow: 'none', background: 'var(--bg)', maxHeight: 300, overflow: 'auto' }}>
        {list.map((x) => (
          <div key={x.code} className="list-row"><span>{x.label || '—'}</span><span className="code-tag">{dash(x.code)}</span></div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* ignore */ } }}>
          {copied ? 'تم النسخ' : 'نسخ القائمة'}
        </button>
        <button className="btn light" onClick={onClose}>تم</button>
      </div>
    </Modal>
  );
}

function EditCode({ ctx, c, onClose, onDone }: { ctx: AdminCtx; c: Code; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(c.label);
  const [expires, setExpires] = useState(c.expires_at.slice(0, 10));
  const [maxDev, setMaxDev] = useState(c.max_devices);
  const [active, setActive] = useState(c.active);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const run = async (fn: string, args: Record<string, unknown>) => {
    setBusy(true); setErr('');
    try { await ctx.call(fn, args); onDone(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="row between">
        <h2 style={{ fontSize: 19 }}>{c.label || 'طالب'}</h2>
        <span className="code-tag">{dash(c.code)}</span>
      </div>
      <div className="small muted num">
        أُنشئ {fmtDate(c.created_at)}. مجموع الدراسة {Math.round(c.seconds_total / 60)} دقيقة و{c.reviews_total} مراجعة.
      </div>
      <div>
        <label className="label">الاسم</label>
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="label">صالح حتى</label>
          <input type="date" className="field" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <div style={{ width: 130 }}>
          <label className="label">أقصى عدد أجهزة</label>
          <input type="number" min={1} max={5} className="field" value={maxDev} onChange={(e) => setMaxDev(Number(e.target.value) || 1)} />
        </div>
      </div>
      <label className="row" style={{ gap: 10 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 20, height: 20 }} />
        <span>الرمز فعّال</span>
      </label>
      <div>
        <p className="label">الأجهزة المسجّلة</p>
        {c.devices.length === 0 ? <p className="small faint">لم يسجّل أي جهاز بعد.</p> : (
          <div className="stack-sm">
            {c.devices.map((d, i) => (
              <div key={i} className="row between small"><span className="ltr">{d.name || 'جهاز'}</span><span className="muted">{rel(d.last_seen)}</span></div>
            ))}
            <button className="link small" disabled={busy} onClick={() => run('admin_reset_devices', { p_code: c.code })}>
              تسجيل خروج كل الأجهزة (للسماح بأجهزة جديدة)
            </button>
          </div>
        )}
      </div>
      {err && <div className="notice err">{err}</div>}
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run('admin_update_code', {
            p_code: c.code, p_label: label, p_expires_at: new Date(expires + 'T23:59:59').toISOString(), p_max_devices: maxDev, p_active: active,
          })}>حفظ التغييرات</button>
          <button className="btn light" onClick={onClose}>إلغاء</button>
        </div>
        {confirmDel ? (
          <button className="btn danger small-btn" disabled={busy} onClick={() => run('admin_delete_code', { p_code: c.code })}>تأكيد الحذف النهائي</button>
        ) : (
          <button className="link small" style={{ color: 'var(--again)' }} onClick={() => setConfirmDel(true)}>حذف الرمز وبياناته</button>
        )}
      </div>
    </Modal>
  );
}
