import { S, dayKey, useStore } from '../lib/store';
import { counts } from '../lib/srs';
import { fmtMinutes, learnedCount, minutes, retention, reviewsByDay, shiftDay, streak } from '../lib/stats';
import { IFlame } from '../ui/icons';

const WEEKS = 18;
const AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export default function Stats() {
  useStore();
  const today = dayKey();
  const byDay = reviewsByDay();
  const st = streak(byDay);
  const { learned, mature } = learnedCount();
  const ret = retention();

  // heatmap: columns = weeks, starting on Saturday
  const todayDate = new Date(today + 'T12:00:00');
  const offset = (todayDate.getDay() + 1) % 7; // days since Saturday
  const start = shiftDay(today, -(WEEKS - 1) * 7 - offset);
  const cells: { k: string; l: number }[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const k = shiftDay(start, i);
    if (k > today) { cells.push({ k, l: -1 }); continue; }
    const n = byDay.get(k) ?? 0;
    cells.push({ k, l: n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : n < 70 ? 3 : 4 });
  }
  const totalReviews = S.reviews.length;
  const activeDays = [...byDay.values()].filter(Boolean).length;

  const last14 = Array.from({ length: 14 }, (_, i) => shiftDay(today, i - 13));
  const mins = last14.map((k) => minutes(k));
  const maxMin = Math.max(10, ...mins);
  const weekMin = mins.slice(-7).reduce((a, b) => a + b, 0);

  return (
    <div className="screen stack-lg">
      <h1 style={{ fontSize: 24 }}>الإحصائيات</h1>

      <div className="metrics">
        <div className="metric"><b className="num">{byDay.get(today) ?? 0}</b><span>مراجعة اليوم</span></div>
        <div className="metric"><b className="num">{fmtMinutes(minutes(today))}</b><span>وقت اليوم</span></div>
        <div className="metric">
          <b className="num row" style={{ gap: 4 }}>{st}<IFlame width={18} height={18} style={{ color: st ? 'var(--gold)' : 'var(--ink-3)' }} /></b>
          <span>أيام متتالية</span>
        </div>
      </div>

      <section className="panel pad stack">
        <div className="row between">
          <h2 style={{ fontSize: 16 }}>وقت الدراسة</h2>
          <span className="small muted num">{fmtMinutes(weekMin)} هذا الأسبوع</span>
        </div>
        <div className="bars" dir="ltr">
          {last14.map((k, i) => (
            <div key={k} title={`${AR_DAYS[new Date(k + 'T12:00:00').getDay()]} ${k}: ${mins[i]} د`}>
              <i className={mins[i] ? '' : 'zero'} style={{ height: `${Math.max(2, (mins[i] / maxMin) * 100)}%` }} />
              <span>{Number(k.slice(8))}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel pad stack">
        <div className="row between">
          <h2 style={{ fontSize: 16 }}>أيام الدراسة</h2>
          <span className="small muted num">{activeDays} يوم، {totalReviews} مراجعة</span>
        </div>
        <div className="heat" aria-label="خريطة أيام الدراسة">
          {cells.map((c) => (
            <i key={c.k} data-l={c.l < 0 ? undefined : c.l} className={c.k === today ? 'today' : ''}
               style={c.l < 0 ? { visibility: 'hidden' } : undefined} title={`${c.k}: ${byDay.get(c.k) ?? 0}`} />
          ))}
        </div>
      </section>

      <section className="panel pad stack">
        <h2 style={{ fontSize: 16 }}>التقدّم</h2>
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div><b className="num" style={{ fontSize: 22 }}>{learned}</b><p className="small muted">تعلّمتها</p></div>
          <div><b className="num" style={{ fontSize: 22 }}>{mature}</b><p className="small muted">راسخة (+21 يوم)</p></div>
          <div><b className="num" style={{ fontSize: 22 }}>{ret === null ? '—' : ret + '%'}</b><p className="small muted">نسبة التذكّر</p></div>
        </div>
        <div className="stack-sm">
          {S.decks.map((d) => {
            const c = counts(new Set([d.id]));
            const pct = c.total ? Math.round((c.seen / c.total) * 100) : 0;
            return (
              <div key={d.id}>
                <div className="row between small"><span>{d.name}</span><span className="muted num">{c.seen}/{c.total}</span></div>
                <div className="bar" style={{ marginTop: 6 }}><i style={{ width: pct + '%' }} /></div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
