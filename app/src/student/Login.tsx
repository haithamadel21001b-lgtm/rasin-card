import { useState } from 'react';
import { DEMO, errorText } from '../lib/api';
import { S, useStore } from '../lib/store';
import { redeem, startAutoSync } from '../lib/sync';
import { Rosette } from '../ui/icons';
import InstallHint from './InstallHint';

function formatCode(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return s.length > 4 ? s.slice(0, 4) + '-' + s.slice(4) : s;
}

export default function Login() {
  useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (S.firstLoad) {
    return (
      <div className="login stack" style={{ textAlign: 'center' }}>
        <div className="brand-mark" style={{ margin: '0 auto' }}><Rosette size={52} /></div>
        <h1 style={{ fontSize: 22 }}>أهلاً {S.session?.label}</h1>
        <p className="muted">نجهّز بطاقاتك على هذا الجهاز لتعمل حتى بدون إنترنت.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <div className="spinner" />
          <span className="small muted num">
            {S.cards.size ? `${S.cards.size} بطاقة` : 'جاري التحميل'}
            {S.mediaPending ? `، وبقيت ${S.mediaPending} صورة` : ''}
          </span>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace('-', '').length < 8) { setErr('الرمز يتكون من 8 أحرف وأرقام.'); return; }
    setBusy(true); setErr('');
    try {
      await redeem(code);
      startAutoSync();
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="stack-lg">
        <div className="stack">
          <div className="brand-mark"><Rosette size={52} /></div>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 650 }}>بطاقات رصين</h1>
            <p className="muted" style={{ marginTop: 6 }}>اكتب رمز الدخول الذي استلمته للبدء.</p>
          </div>
        </div>
        {S.notice && <div className="notice">{S.notice}</div>}
        <form onSubmit={submit} className="stack">
          <div>
            <label className="label" htmlFor="code">رمز الدخول</label>
            <input
              id="code" className="field code-input" inputMode="text" autoComplete="one-time-code"
              autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX"
              value={code} onChange={(e) => setCode(formatCode(e.target.value))}
            />
          </div>
          {err && <div className="notice err" role="alert">{err}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'جاري التحقق…' : 'دخول'}</button>
          {DEMO && (
            <p className="small muted" style={{ textAlign: 'center' }}>
              نسخة تجريبية. استخدم الرمز{' '}
              <button type="button" className="link ltr" onClick={() => setCode('DEMO-2026')}>DEMO-2026</button>
            </p>
          )}
        </form>
        <InstallHint />
      </div>
    </div>
  );
}
