import { lazy, Suspense, useEffect, useState } from 'react';
import StudentApp from './student/StudentApp';

const Admin = lazy(() => import('./admin/Admin'));

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export default function App() {
  const hash = useHash();
  if (/^#\/?admin/.test(hash)) {
    return (
      <Suspense fallback={<div className="login"><div className="spinner" style={{ margin: '0 auto' }} /></div>}>
        <Admin />
      </Suspense>
    );
  }
  return <StudentApp />;
}
