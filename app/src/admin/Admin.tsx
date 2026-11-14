import { useEffect, useState } from 'react';
import { DEMO, errorText, rpc, ApiError } from '../lib/api';
import { Rosette } from '../ui/icons';
import Overview from './Overview';
import Students from './Students';
import Decks from './Decks';

const KEY = 'rasin.adminToken';

export type AdminCtx = { token: string; call: <T = any>(fn: string, args?: Record<string, unknown>) => Promise<T> };

export default function Admin() {
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [tab, setTab] = useState<'overview' | 'students' | 'decks'>('students');

  useEffect(() => { document.title = 'لوحة المسؤول - بطاقات رصين'; return () => { document.title = 'بطاقات رصين'; }; }, []);

  const save = (t: string | null) => {
    try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* ignore */ }
    setToken(t);
  };

  if (!token) return <AdminLogin onToken={save} />;

  const ctx: AdminCtx = {
    token,
    call: async (fn, args = {}) => {
      try {
        return await rpc(fn, { p_token: token, ...args });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ADMIN_SESSION_INVALID') save(null);
        throw e;
      }
    },
  };

  return (
    <div className="admin">
      <div className="admin-top">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark" style={{ width: 46, height: 46, borderRadius: 15 }}><Rosette size={30} /></div>
          <div>
            <h1 style={{ fontSize: 20 }}>لوحة المسؤول</h1>
            <p className="tiny faint">بطاقات رصين{DEMO ? '، نسخة تجريبية' : ''}</p>
          </div>
        </div>
        <div className="seg" role="tablist">
          <button aria-pressed={tab === 'students'} onClick={() => setTab('students')}>الطلاب</button>
          <button aria-pressed={tab === 'decks'} onClick={() => setTab('decks')}>البطاقات</button>
          <button aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>نظرة عامة</button>
        </div>
        <div className="row">
          <a className="link small" href="#app">واجهة الطالب</a>
          <button className="link small" style={{ color: 'var(--ink-2)' }} onClick={() => save(null)}>خروج</button>
        </div>
      </div>
      {tab === 'overview' && <Overview ctx={ctx} />}
      {tab === 'students' && <Students ctx={ctx} />}
      {tab === 'decks' && <Decks ctx={ctx} />}
    </div>
  );
}

function AdminLogin({ onToken }: { onToken: (t: string) => void }) {
  const [hasPw, setHasPw] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rpc<{ has_password: boolean }>('admin_status').then((r) => setHasPw(r.has_password)).catch((e) => setErr(errorText(e)));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (hasPw === false && pw !== pw2) { setErr('كلمتا المرور غير متطابقتين.'); return; }
    setBusy(true);
    try {
      const r = hasPw ? await rpc<{ token: string }>('admin_login', { p_password: pw })
        : await rpc<{ token: string }>('admin_set_password', { p_new: pw, p_old: null });
      onToken(r.token);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="stack" onSubmit={submit}>
        <div className="brand-mark"><Rosette size={52} /></div>
        <h1 style={{ fontSize: 26 }}>لوحة المسؤول</h1>
        {hasPw === null && !err && <div className="spinner" />}
        {hasPw === false && <p className="muted">أول دخول: اختر كلمة مرور للوحة المسؤول (8 أحرف على الأقل) واحفظها جيداً.</p>}
        {hasPw !== null && (
          <>
            <div>
              <label className="label" htmlFor="pw">كلمة المرور</label>
              <input id="pw" type="password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={hasPw ? 'current-password' : 'new-password'} />
            </div>
            {hasPw === false && (
              <div>
                <label className="label" htmlFor="pw2">أعد كتابة كلمة المرور</label>
                <input id="pw2" type="password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              </div>
            )}
            <button className="btn block" disabled={busy}>{busy ? 'لحظة…' : hasPw ? 'دخول' : 'حفظ كلمة المرور والدخول'}</button>
            {DEMO && <p className="small muted">كلمة المرور في النسخة التجريبية: <span className="code-tag">demo1234</span></p>}
          </>
        )}
        {err && <div className="notice err">{err}</div>}
      </form>
    </div>
  );
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal panel pad stack">{children}</div>
    </div>
  );
}

export function rel(iso?: string | null) {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const f = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  const a = Math.abs(diff);
  if (a < 60) return 'الآن';
  if (a < 3600) return f.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return f.format(Math.round(diff / 3600), 'hour');
  return f.format(Math.round(diff / 86400), 'day');
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-IQ-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
export const dash = (c: string) => c.slice(0, 4) + '-' + c.slice(4);
