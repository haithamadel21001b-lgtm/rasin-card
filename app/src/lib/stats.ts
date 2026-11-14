import { S, dayKey, totalSeconds } from './store';
import { State } from 'ts-fsrs';

export function reviewsByDay() {
  const m = new Map<string, number>();
  for (const r of S.reviews) {
    const k = dayKey(new Date(r.reviewed_at));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function shiftDay(key: string, delta: number) {
  const [y, mo, d] = key.split('-').map(Number);
  const t = new Date(y, mo - 1, d + delta, 12);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function streak(byDay = reviewsByDay()) {
  let k = dayKey();
  if (!byDay.get(k)) k = shiftDay(k, -1);
  let n = 0;
  while (byDay.get(k)) { n++; k = shiftDay(k, -1); }
  return n;
}

export function minutes(day: string) {
  return Math.round(totalSeconds(day) / 60);
}

export function learnedCount(deckId?: string) {
  let n = 0, mature = 0;
  for (const [id, s] of S.states) {
    const c = S.cards.get(id);
    if (!c || (deckId && c.deck_id !== deckId)) continue;
    if (Number(s.card.state) !== State.New) n++;
    if (Number(s.card.scheduled_days) >= 21) mature++;
  }
  return { learned: n, mature };
}

export function retention(days = 30) {
  const since = Date.now() - days * 864e5;
  let ok = 0, all = 0;
  for (const r of S.reviews) {
    if (new Date(r.reviewed_at).getTime() < since) continue;
    all++;
    if (r.rating > 1) ok++;
  }
  return all ? Math.round((ok / all) * 100) : null;
}

export function fmtMinutes(m: number) {
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  return `${h} س ${m % 60 ? `${m % 60} د` : ''}`.trim();
}
