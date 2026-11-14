import { useEffect, useState } from 'react';
import { IShare } from '../ui/icons';

let deferred: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export default function InstallHint({ compact = false }: { compact?: boolean }) {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); deferred = e; setCanPrompt(true); };
    window.addEventListener('beforeinstallprompt', f);
    return () => window.removeEventListener('beforeinstallprompt', f);
  }, []);
  if (isStandalone()) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);

  return (
    <div className="panel pad stack-sm" style={{ boxShadow: 'var(--sh-1)' }}>
      <b style={{ fontWeight: 600 }}>أضِف التطبيق إلى الشاشة الرئيسية</b>
      {canPrompt ? (
        <button className="btn light block small-btn" onClick={async () => { deferred?.prompt(); deferred = null; setCanPrompt(false); }}>
          تثبيت التطبيق
        </button>
      ) : ios ? (
        <ol className="steps small muted">
          <li>افتح هذه الصفحة في متصفح Safari.</li>
          <li>اضغط زر المشاركة <IShare width={16} height={16} style={{ verticalAlign: '-3px' }} /> أسفل الشاشة.</li>
          <li>اختر «إضافة إلى الشاشة الرئيسية».</li>
        </ol>
      ) : (
        <ol className="steps small muted">
          <li>افتح قائمة المتصفح (⋮) في الأعلى.</li>
          <li>اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li>
        </ol>
      )}
      {!compact && <p className="tiny faint">بعدها يفتح كتطبيق مستقل ويعمل بدون إنترنت.</p>}
    </div>
  );
}
