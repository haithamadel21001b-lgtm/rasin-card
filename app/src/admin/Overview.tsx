import { useEffect, useState } from 'react';
import { errorText } from '../lib/api';
import { plain } from '../lib/render';
import type { AdminCtx } from './Admin';

type O = {
  students: number; joined: number; active_today: number; active_7d: number; cards: number;
  daily: { day: string; reviews: number; students: number }[];
  hard_cards: { id: string; front: string; deck: string; reviews: number; again: number; students: number }[];
};

export default function Overview({ ctx }: { ctx: AdminCtx }) {
  const [o, setO] = useState<O | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { ctx.call<O>('admin_overview').then(setO).catch((e) => setErr(errorText(e))); }, [ctx.token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="notice err">{err}</div>;
  if (!o) return <div className="spinner" />;

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    const k = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
    return { k, v: o.daily.find((x) => x.day.slice(0, 10) === k) };
  });
  const max = Math.max(10, ...days.map((d) => d.v?.reviews ?? 0));

  return (
    <div className="stack">
      <div className="kpis">
        <K n={o.students} t="رموز فعّالة" />
        <K n={o.joined} t="طلاب سجّلوا الدخول" />
        <K n={o.active_today} t="درسوا اليوم" />
        <K n={o.active_7d} t="درسوا هذا الأسبوع" />
        <K n={o.cards} t="بطاقة منشورة" />
      </div>
      <div className="grid2">
        <section className="panel pad stack">
          <h2 style={{ fontSize: 16 }}>المراجعات اليومية، آخر 30 يوماً</h2>
          <div className="bars" dir="ltr" style={{ height: 160 }}>
            {days.map((d) => (
              <div key={d.k} title={`${d.k}: ${d.v?.reviews ?? 0} مراجعة من ${d.v?.students ?? 0} طالب`}>
                <i className={d.v ? '' : 'zero'} style={{ height: `${Math.max(2, ((d.v?.reviews ?? 0) / max) * 100)}%` }} />
              </div>
            ))}
          </div>
        </section>
        <section className="panel pad stack">
          <div>
            <h2 style={{ fontSize: 16 }}>أصعب البطاقات</h2>
            <p className="small muted">البطاقات التي يضغط عليها الطلاب «نسيت» أكثر، آخر 30 يوماً.</p>
          </div>
          {o.hard_cards.length === 0 ? <p className="small faint">ستظهر هنا عندما يبدأ الطلاب بالمراجعة.</p> : (
            <div className="stack-sm">
              {o.hard_cards.map((c) => (
                <div key={c.id} className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <p dir="auto" style={{ fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>{plain(c.front)}</p>
                    <p className="tiny faint">{c.deck}، {c.students} طالب</p>
                  </div>
                  <span className="pill red num">{Math.round((c.again / c.reviews) * 100)}% نسيان</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function K({ n, t }: { n: number; t: string }) {
  return <div className="metric"><b className="num" style={{ fontSize: 26 }}>{n}</b><span>{t}</span></div>;
}
