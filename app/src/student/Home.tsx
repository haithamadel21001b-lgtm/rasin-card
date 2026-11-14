import { motion } from 'framer-motion';
import { S, dayKey, useStore } from '../lib/store';
import { counts } from '../lib/srs';
import { learnedCount, minutes, streak, fmtMinutes } from '../lib/stats';
import { IFlame } from '../ui/icons';
import type { StudyTarget } from './StudentApp';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}

export default function Home({ onStudy }: { onStudy: (t: StudyTarget) => void }) {
  useStore();
  const all = counts(null);
  const due = all.fresh + all.learn + all.review;
  const st = streak();
  const todayMin = minutes(dayKey());

  return (
    <div className="screen stack-lg">
      <header className="row between">
        <div>
          <p className="small muted">{greeting()}</p>
          <h1 style={{ fontSize: 24 }}>{S.session?.label || 'أهلاً بك'}</h1>
        </div>
        <span className={'sync-dot' + (S.online ? '' : ' off')} title={S.online ? 'متصل' : 'بدون إنترنت'} />
      </header>

      <motion.section
        className="tile"
        initial={{ y: 14, opacity: 0, rotateX: 8 }}
        animate={{ y: 0, opacity: 1, rotateX: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        style={{ transformPerspective: 900 }}
      >
        {due > 0 ? (
          <>
            <p style={{ opacity: 0.85 }}>بطاقات اليوم</p>
            <div className="big num" style={{ margin: '6px 0 12px' }}>{due}</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {all.fresh > 0 && <span className="chip"><i className="dot" style={{ background: '#9fb8ea' }} />{all.fresh} جديدة</span>}
              {all.learn > 0 && <span className="chip"><i className="dot" style={{ background: '#f0a49c' }} />{all.learn} قيد التعلّم</span>}
              {all.review > 0 && <span className="chip"><i className="dot" style={{ background: '#9fd3b4' }} />{all.review} مراجعة</span>}
            </div>
            <button className="btn light block" onClick={() => onStudy({ deckIds: null, title: 'كل المجموعات' })}>ابدأ المراجعة</button>
          </>
        ) : (
          <>
            <p style={{ opacity: 0.85 }}>بطاقات اليوم</p>
            <h2 style={{ fontSize: 26, margin: '8px 0 6px' }}>{all.total ? 'أنهيت مراجعة اليوم' : 'لا توجد بطاقات بعد'}</h2>
            <p style={{ opacity: 0.8, fontSize: 14.5 }}>
              {all.total ? 'عُد غداً لمراجعة ما يحين موعده.' : 'ستظهر البطاقات هنا عندما يضيفها المسؤول.'}
            </p>
          </>
        )}
      </motion.section>

      <div className="metrics">
        <div className="metric"><b className="num">{fmtMinutes(todayMin)}</b><span>دراسة اليوم</span></div>
        <div className="metric">
          <b className="num row" style={{ gap: 4 }}>{st}<IFlame width={18} height={18} style={{ color: st ? 'var(--gold)' : 'var(--ink-3)' }} /></b>
          <span>أيام متتالية</span>
        </div>
        <div className="metric"><b className="num">{learnedCount().learned}</b><span>بطاقة تعلّمتها</span></div>
      </div>

      {S.decks.length > 0 && (
        <section className="stack-sm">
          <h2 style={{ fontSize: 17, paddingInline: 4 }}>المواد</h2>
          <div className="panel decks">
            {S.decks.map((d) => {
              const c = counts(new Set([d.id]));
              const pct = c.total ? Math.round((c.seen / c.total) * 100) : 0;
              return (
                <button key={d.id} className="deck" onClick={() => onStudy({ deckIds: new Set([d.id]), title: d.name })}>
                  <div>
                    <h3>{d.name}</h3>
                    <div className="sub num">{c.total} بطاقة، تعلّمت منها <span className="ltr">{pct}%</span></div>
                  </div>
                  <div className="counts num" aria-label="جديدة، قيد التعلّم، مراجعة">
                    <span className={c.fresh ? 'n' : 'z'}>{c.fresh}</span>
                    <span className={c.learn ? 'l' : 'z'}>{c.learn}</span>
                    <span className={c.review ? 'r' : 'z'}>{c.review}</span>
                  </div>
                  <div className="bar"><i style={{ width: pct + '%' }} /></div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
