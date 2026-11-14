// Spaced repetition (FSRS — the same method modern Anki uses).
import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card as FCard, type Grade } from 'ts-fsrs';
import { S, db, emit, dayKey, dayEnd, type Card, type StateRec, type ReviewRec } from './store';
import { scheduleSync } from './sync';

export { Rating, State };

export const scheduler = fsrs(generatorParameters({
  request_retention: 0.9,
  maximum_interval: 3 * 365,
  enable_fuzz: true,
  enable_short_term: true,
}));

export function toF(c: Record<string, any> | undefined): FCard {
  if (!c) return createEmptyCard(new Date());
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined } as FCard;
}
function fromF(c: FCard) {
  return { ...c, due: c.due.toISOString(), last_review: c.last_review ? new Date(c.last_review).toISOString() : undefined };
}

export function stateOf(id: string): State {
  const s = S.states.get(id);
  return s ? (Number(s.card.state) as State) : State.New;
}

/** Which day each card was first studied — needed for the "new cards per day" limit. */
let introCache: { n: number; map: Map<string, string> } | null = null;
function introduced() {
  if (introCache && introCache.n === S.reviews.length) return introCache.map;
  const map = new Map<string, string>();
  const sorted = [...S.reviews].sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
  for (const r of sorted) if (!map.has(r.card_id)) map.set(r.card_id, dayKey(new Date(r.reviewed_at)));
  introCache = { n: S.reviews.length, map };
  return map;
}

const noteOf = (id: string) => id.replace(/-c\d+$/, '');
/** Notes already studied today: their other cloze cards wait until tomorrow (like Anki). */
function buried() {
  const today = dayKey();
  const set = new Set<string>();
  for (let i = S.reviews.length - 1; i >= 0; i--) {
    const r = S.reviews[i];
    if (dayKey(new Date(r.reviewed_at)) === today) set.add(noteOf(r.card_id));
  }
  return set;
}

export function cardsOf(deckIds: Set<string> | null): Card[] {
  const live = new Set(S.decks.map((d) => d.id));
  return [...S.cards.values()].filter((c) => live.has(c.deck_id) && (!deckIds || deckIds.has(c.deck_id)));
}

export function newLeft(deckId: string) {
  const today = dayKey();
  const intro = introduced();
  let used = 0;
  for (const [id, day] of intro) if (day === today && S.cards.get(id)?.deck_id === deckId) used++;
  return Math.max(0, S.settings.newPerDay - used);
}

export type Counts = { fresh: number; learn: number; review: number; total: number; seen: number };
export function counts(deckIds: Set<string> | null, now = new Date()): Counts {
  const end = dayEnd(now).getTime();
  const res: Counts = { fresh: 0, learn: 0, review: 0, total: 0, seen: 0 };
  const freshByDeck = new Map<string, number>();
  const bury = buried();
  for (const c of cardsOf(deckIds)) {
    res.total++;
    const s = S.states.get(c.id);
    const st = s ? Number(s.card.state) : State.New;
    if (st === State.New) { if (bury.has(noteOf(c.id))) continue; freshByDeck.set(c.deck_id, (freshByDeck.get(c.deck_id) ?? 0) + 1); continue; }
    res.seen++;
    const due = new Date(s!.card.due).getTime();
    if (st === State.Review && due < end) res.review++;
    else if ((st === State.Learning || st === State.Relearning) && due < end) res.learn++;
  }
  for (const [deck, n] of freshByDeck) res.fresh += Math.min(n, newLeft(deck));
  return res;
}

const LEARN_AHEAD_MS = 20 * 60 * 1000;

export type Pick = { card: Card; kind: 'new' | 'learn' | 'review' } | { wait: Date } | null;

export function pickNext(deckIds: Set<string> | null, shown: number, skip?: string): Pick {
  const now = Date.now();
  const end = dayEnd().getTime();
  const learnNow: [Card, number][] = [];
  const learnSoon: [Card, number][] = [];
  const reviews: [Card, number][] = [];
  const fresh: Card[] = [];
  const freshLeft = new Map<string, number>();
  const bury = buried();
  for (const c of cardsOf(deckIds)) {
    if (c.id === skip) continue;
    const s = S.states.get(c.id);
    const st = s ? Number(s.card.state) : State.New;
    if (st === State.New) {
      if (bury.has(noteOf(c.id))) continue;
      if (!freshLeft.has(c.deck_id)) freshLeft.set(c.deck_id, newLeft(c.deck_id));
      if (freshLeft.get(c.deck_id)! > 0) fresh.push(c);
      continue;
    }
    const due = new Date(s!.card.due).getTime();
    if (st === State.Review) { if (due < end) reviews.push([c, due]); continue; }
    if (due <= now) learnNow.push([c, due]);
    else if (due < end) learnSoon.push([c, due]);
  }
  const byDue = (a: [Card, number], b: [Card, number]) => a[1] - b[1];
  learnNow.sort(byDue); reviews.sort(byDue); learnSoon.sort(byDue);
  const deckPos = new Map(S.decks.map((d) => [d.id, d.position]));
  fresh.sort((a, b) => (deckPos.get(a.deck_id) ?? 0) - (deckPos.get(b.deck_id) ?? 0) || a.position - b.position);
  // keep each deck's daily new limit
  const allowed: Card[] = [];
  const used = new Map<string, number>();
  for (const c of fresh) {
    const u = used.get(c.deck_id) ?? 0;
    if (u < freshLeft.get(c.deck_id)!) { allowed.push(c); used.set(c.deck_id, u + 1); }
  }

  if (learnNow.length) return { card: learnNow[0][0], kind: 'learn' };
  const wantNew = allowed.length && (!reviews.length || shown % 4 === 3);
  if (wantNew) return { card: allowed[0], kind: 'new' };
  if (reviews.length) return { card: reviews[0][0], kind: 'review' };
  if (learnSoon.length && learnSoon[0][1] - now <= LEARN_AHEAD_MS) return { card: learnSoon[0][0], kind: 'learn' };
  if (learnSoon.length) return { wait: new Date(learnSoon[0][1]) };
  if (skip) return pickNext(deckIds, shown);
  return null;
}

export function preview(cardId: string) {
  const now = new Date();
  const rec = scheduler.repeat(toF(S.states.get(cardId)?.card), now);
  return {
    [Rating.Again]: rec[Rating.Again].card.due,
    [Rating.Hard]: rec[Rating.Hard].card.due,
    [Rating.Good]: rec[Rating.Good].card.due,
    [Rating.Easy]: rec[Rating.Easy].card.due,
  } as Record<Grade, Date>;
}

export type Undo = { prev: StateRec | undefined; reviewId: number; cardId: string };

export async function rate(cardId: string, grade: Grade, durationMs: number): Promise<Undo> {
  const now = new Date();
  const prev = S.states.get(cardId);
  const { card } = scheduler.next(toF(prev?.card), now, grade);
  const rec: StateRec = { card_id: cardId, card: fromF(card), updated_at: now.toISOString(), dirty: 1 };
  const rv: ReviewRec = { card_id: cardId, rating: grade, reviewed_at: now.toISOString(), duration_ms: Math.min(durationMs, 600000), synced: 0 };
  const d = await db();
  const tx = d.transaction(['states', 'reviews'], 'readwrite');
  tx.objectStore('states').put(rec);
  rv.id = (await tx.objectStore('reviews').add(rv)) as number;
  await tx.done;
  S.states.set(cardId, rec);
  S.reviews.push(rv);
  emit();
  scheduleSync(20000);
  return { prev: prev ? { ...prev } : undefined, reviewId: rv.id, cardId };
}

export async function undo(u: Undo) {
  const d = await db();
  const now = new Date().toISOString();
  if (u.prev) {
    const rec = { ...u.prev, updated_at: now, dirty: 1 as const };
    await d.put('states', rec);
    S.states.set(u.cardId, rec);
  } else {
    const fresh: StateRec = { card_id: u.cardId, card: fromF(createEmptyCard(new Date())), updated_at: now, dirty: 1 };
    await d.put('states', fresh);
    S.states.set(u.cardId, fresh);
  }
  const i = S.reviews.findIndex((r) => r.id === u.reviewId);
  if (i >= 0 && !S.reviews[i].synced) {
    await d.delete('reviews', u.reviewId);
    S.reviews.splice(i, 1);
  }
  emit();
}

export function fmtInterval(due: Date, now = new Date()) {
  const m = (due.getTime() - now.getTime()) / 60000;
  if (m < 1) return 'الآن';
  if (m < 60) return `${Math.round(m)} د`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} س`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} يوم`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo * 10) / 10} شهر`.replace('.0', '');
  return `${Math.round((d / 365) * 10) / 10} سنة`.replace('.0', '');
}
