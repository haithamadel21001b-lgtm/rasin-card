import { DEMO } from '../lib/api';
import { S, saveSettings, useStore } from '../lib/store';
import { sync, OFFLINE_DAYS } from '../lib/sync';
import InstallHint from './InstallHint';

const fmtDate = (iso: string | number) =>
  new Date(iso).toLocaleDateString('ar-IQ-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString('ar-IQ-u-nu-latn', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Settings() {
  useStore();
  const s = S.session!;
  const n = S.settings.newPerDay;
  const setN = (v: number) => saveSettings({ newPerDay: Math.max(0, Math.min(200, v)) });

  return (
    <div className="screen stack-lg">
      <h1 style={{ fontSize: 24 }}>الإعدادات</h1>

      <section className="panel">
        <div className="list-row">
          <div>
            <b style={{ fontWeight: 600 }}>بطاقات جديدة يومياً</b>
            <p className="small muted">لكل مادة. الأقل يعني مراجعات أخف لاحقاً.</p>
          </div>
          <div className="stepper">
            <button onClick={() => setN(n - 5)} aria-label="أقل">−</button>
            <b className="num">{n}</b>
            <button onClick={() => setN(n + 5)} aria-label="أكثر">+</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="list-row"><span className="muted">الاسم</span><b style={{ fontWeight: 600 }}>{s.label || '—'}</b></div>
        <div className="list-row"><span className="muted">رمز الدخول</span><span className="code-tag">{s.code.slice(0, 4)}-••••</span></div>
        <div className="list-row"><span className="muted">صالح حتى</span><span className="num">{fmtDate(s.expires_at)}</span></div>
        <div className="list-row">
          <div>
            <span className="muted">آخر مزامنة</span>
            <p className="tiny faint num">{S.lastContact ? fmtTime(S.lastContact) : 'لم تتم بعد'}</p>
          </div>
          <button className="btn light small-btn" onClick={() => sync()} disabled={S.syncing}>
            {S.syncing ? 'جاري…' : 'مزامنة الآن'}
          </button>
        </div>
      </section>

      <p className="small muted" style={{ paddingInline: 4 }}>
        يمكنك الدراسة بدون إنترنت، ويُحفظ تقدّمك على جهازك ثم يُرفع تلقائياً عند الاتصال.
        يحتاج التطبيق إلى الاتصال مرة واحدة على الأقل كل {OFFLINE_DAYS} أيام.
      </p>

      <InstallHint />

      {DEMO && (
        <section className="panel pad stack-sm">
          <b style={{ fontWeight: 600 }}>لوحة المسؤول (نسخة تجريبية)</b>
          <p className="small muted">جرّب رفع البطاقات وإنشاء الرموز ومتابعة الطلاب. كلمة المرور: <span className="ltr code-tag">demo1234</span></p>
          <a className="btn light small-btn" href="#admin">فتح لوحة المسؤول</a>
        </section>
      )}
    </div>
  );
}
