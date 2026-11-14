import { S, useStore } from '../lib/store';
import { sync, OFFLINE_DAYS } from '../lib/sync';
import { ICloudOff } from '../ui/icons';

export default function Locked() {
  useStore();
  const expired = S.session && new Date(S.session.expires_at).getTime() < Date.now();
  return (
    <div className="login stack" style={{ textAlign: 'center' }}>
      <div className="done-mark" style={{ background: 'var(--ink-2)', boxShadow: 'none' }}><ICloudOff width={40} height={40} /></div>
      {expired ? (
        <>
          <h1 style={{ fontSize: 22 }}>انتهت صلاحية رمزك</h1>
          <p className="muted">تواصل مع المسؤول لتجديد الاشتراك، ثم اتصل بالإنترنت واضغط «تحقّق الآن».</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 22 }}>اتصل بالإنترنت للمتابعة</h1>
          <p className="muted">مرّ أكثر من {OFFLINE_DAYS} أيام بدون اتصال. يحتاج التطبيق إلى اتصال قصير للتحقق من اشتراكك، وتقدّمك محفوظ.</p>
        </>
      )}
      <button className="btn" onClick={() => sync()} disabled={S.syncing}>{S.syncing ? 'جاري التحقق…' : 'تحقّق الآن'}</button>
      {!S.online && <p className="small faint">لا يوجد اتصال حالياً.</p>}
    </div>
  );
}
