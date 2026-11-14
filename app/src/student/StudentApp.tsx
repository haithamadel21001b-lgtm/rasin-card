import { useEffect, useState } from 'react';
import { S, loadAll, useStore } from '../lib/store';
import { isLocked, startAutoSync } from '../lib/sync';
import { IChart, IGear, IHome } from '../ui/icons';
import Login from './Login';
import Home from './Home';
import Study from './Study';
import Stats from './Stats';
import Settings from './Settings';
import Locked from './Locked';

export type StudyTarget = { deckIds: Set<string> | null; title: string };

export default function StudentApp() {
  useStore();
  const [tab, setTab] = useState<'home' | 'stats' | 'settings'>('home');
  const [study, setStudy] = useState<StudyTarget | null>(null);

  useEffect(() => {
    loadAll().then(() => { if (S.session) startAutoSync(); });
    const block = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea')) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', block);
    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('dragstart', block);
    };
  }, []);

  if (!S.ready) return <div className="login"><div className="spinner" style={{ margin: '0 auto' }} /></div>;
  if (!S.session || S.firstLoad) return <Login />;
  if (isLocked()) return <Locked />;

  return (
    <div className="protect">
      {tab === 'home' && <Home onStudy={setStudy} />}
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && <Settings />}
      <div className="tabbar">
        <nav aria-label="التنقل">
          <button aria-current={tab === 'home' ? 'page' : undefined} onClick={() => setTab('home')}><IHome />الرئيسية</button>
          <button aria-current={tab === 'stats' ? 'page' : undefined} onClick={() => setTab('stats')}><IChart />الإحصائيات</button>
          <button aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')}><IGear />الإعدادات</button>
        </nav>
      </div>
      {study && <Study target={study} onClose={() => setStudy(null)} />}
    </div>
  );
}
