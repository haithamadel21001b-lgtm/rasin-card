// Keeps the phone and the server in step. Works quietly in the background.
import { rpc, ApiError } from './api';
import { S, db, emit, kvGet, kvSet, encJson, encBytes, wipe, dropMediaCache, type Card, type Deck, type Session, type StateRec, type ReviewRec } from './store';

export const OFFLINE_DAYS = 7;
const FATAL = new Set(['SESSION_INVALID', 'CODE_DISABLED', 'CODE_EXPIRED']);
const FATAL_TEXT: Record<string, string> = {
  SESSION_INVALID: 'تم تسجيل خروج هذا الجهاز من قبل المسؤول. أدخل رمزك من جديد.',
  CODE_DISABLED: 'تم إيقاف رمز الدخول الخاص بك. تواصل مع المسؤول.',
  CODE_EXPIRED: 'انتهت صلاحية رمز الدخول الخاص بك. تواصل مع المسؤول لتجديده.',
};

export function isLocked() {
  if (!S.session) return false;
  if (new Date(S.session.expires_at).getTime() < Date.now()) return true;
  return Date.now() - S.lastContact > OFFLINE_DAYS * 864e5;
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : '';
  return br ? `${os} · ${br}` : os;
}

export async function redeem(code: string) {
  const r = await rpc<{ token: string; label: string; code: string; expires_at: string }>('redeem_code', {
    p_code: code, p_device_id: S.deviceId, p_device_name: deviceName(),
  });
  const prevOwner = await kvGet<string>('ownerCode');
  if (prevOwner && prevOwner !== r.code) await wipe();
  await kvSet('ownerCode', r.code);
  const session: Session = { token: r.token, code: r.code, label: r.label, expires_at: r.expires_at };
  await kvSet('session', session);
  S.session = session;
  S.notice = '';
  await touchContact();
  // Bring back progress from other devices / earlier installs.
  try {
    const p = await rpc<{ states: any[]; reviews: any[]; time: { day: string; seconds: number }[] }>('get_progress', {
      p_token: r.token, p_device_id: S.deviceId,
    });
    const d = await db();
    const tx = d.transaction(['states', 'reviews'], 'readwrite');
    const known = new Set(S.reviews.map((x) => x.card_id + x.reviewed_at));
    for (const s of p.states) {
      const cur = S.states.get(s.card_id);
      if (cur && cur.updated_at >= s.updated_at) continue;
      const rec: StateRec = { card_id: s.card_id, card: s.state, updated_at: s.updated_at, dirty: 0 };
      S.states.set(s.card_id, rec);
      tx.objectStore('states').put(rec);
    }
    for (const rv of p.reviews) {
      const iso = new Date(rv.reviewed_at).toISOString();
      if (known.has(rv.card_id + iso)) continue;
      const rec: ReviewRec = { card_id: rv.card_id, rating: rv.rating, reviewed_at: iso, duration_ms: rv.duration_ms ?? 0, synced: 1 };
      rec.id = (await tx.objectStore('reviews').add(rec)) as number;
      S.reviews.push(rec);
    }
    await tx.done;
    S.remoteTime = Object.fromEntries(p.time.map((t) => [t.day.slice(0, 10), t.seconds]));
    await kvSet('remoteTime', S.remoteTime);
  } catch { /* progress restore is best-effort */ }
  S.firstLoad = true;
  emit();
  await sync();
  S.firstLoad = false;
  emit();
}

async function touchContact() {
  S.lastContact = Date.now();
  await kvSet('lastContact', S.lastContact);
}

let running: Promise<void> | null = null;
export function sync(): Promise<void> {
  return (running ??= doSync().finally(() => { running = null; }));
}

async function doSync() {
  const session = S.session;
  if (!session) return;
  S.syncing = true;
  emit();
  try {
    const ci = await rpc<{ label: string; expires_at: string }>('check_in', { p_token: session.token });
    session.label = ci.label;
    session.expires_at = ci.expires_at;
    await kvSet('session', session);
    await touchContact();
    S.online = true;
    await pullContent(session.token);
    await pushProgress(session.token);
    await pullMedia(session.token);
  } catch (e) {
    if (e instanceof ApiError && FATAL.has(e.code)) {
      await wipe(FATAL_TEXT[e.code]);
    } else if (e instanceof ApiError && e.network) {
      S.online = false;
    } else {
      console.warn('sync failed', e);
    }
  } finally {
    S.syncing = false;
    emit();
  }
}

async function pullContent(token: string) {
  const since = S.lastSync;
  const r = await rpc<{ server_time: string; full: boolean; decks: Deck[]; cards: (Card & { deleted: boolean })[]; media: { name: string }[] }>(
    'get_content', { p_token: token, p_since: since },
  );
  const d = await db();
  // decks: always the full list
  const dtx = d.transaction('decks', 'readwrite');
  await dtx.store.clear();
  for (const dk of r.decks) dtx.store.put(dk);
  await dtx.done;
  S.decks = r.decks.filter((x) => !x.deleted).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  if (r.full) {
    // fresh copy: drop anything that no longer exists
    const ids = new Set(r.cards.map((c) => c.id));
    for (const id of [...S.cards.keys()]) if (!ids.has(id)) { S.cards.delete(id); await d.delete('cards', id); }
  }
  const encd = await Promise.all(r.cards.map(async (c) => {
    if (c.deleted) return { id: c.id, del: true as const };
    const { deleted: _x, ...card } = c;
    return { id: c.id, del: false as const, card, enc: await encJson(card) };
  }));
  const ctx = d.transaction('cards', 'readwrite');
  for (const x of encd) {
    if (x.del) { ctx.store.delete(x.id); S.cards.delete(x.id); }
    else { ctx.store.put({ id: x.id, deck_id: x.card.deck_id, iv: x.enc.iv, data: x.enc.data }); S.cards.set(x.id, x.card as Card); }
  }
  await ctx.done;

  const pending = new Set<string>((await kvGet<string[]>('mediaPending')) ?? []);
  for (const m of r.media) pending.add(m.name);
  await kvSet('mediaPending', [...pending]);
  S.mediaPending = pending.size;
  S.lastSync = r.server_time;
  await kvSet('lastSync', r.server_time);
  emit();
}

async function pullMedia(token: string) {
  let pending: string[] = (await kvGet<string[]>('mediaPending')) ?? [];
  const d = await db();
  while (pending.length) {
    const batch = pending.slice(0, 8);
    const items = await rpc<{ name: string; mime: string; data: string }[]>('get_media', { p_token: token, p_names: batch });
    for (const it of items) {
      const bin = Uint8Array.from(atob(it.data), (ch) => ch.charCodeAt(0));
      const { iv, data } = await encBytes(bin);
      await d.put('media', { name: it.name, mime: it.mime, iv, data });
      dropMediaCache(it.name);
    }
    pending = pending.slice(batch.length);
    await kvSet('mediaPending', pending);
    S.mediaPending = pending.length;
    emit();
  }
}

async function pushProgress(token: string) {
  const dirty = [...S.states.values()].filter((s) => s.dirty);
  const unsynced = S.reviews.filter((r) => !r.synced);
  const days = [...S.time.entries()].filter(([day]) => Date.now() - new Date(day).getTime() < 40 * 864e5)
    .map(([day, seconds]) => ({ day, seconds }));
  if (!dirty.length && !unsynced.length && !days.length) return;
  await rpc('sync_progress', {
    p_token: token,
    p_device_id: S.deviceId,
    p_states: dirty.map((s) => ({ card_id: s.card_id, state: s.card, due: s.card.due, updated_at: s.updated_at })),
    p_reviews: unsynced.map((r) => ({ card_id: r.card_id, rating: r.rating, reviewed_at: r.reviewed_at, duration_ms: r.duration_ms })),
    p_time: days,
  });
  const d = await db();
  const tx = d.transaction(['states', 'reviews'], 'readwrite');
  for (const s of dirty) {
    const cur = S.states.get(s.card_id);
    if (cur && cur.updated_at === s.updated_at) { cur.dirty = 0; tx.objectStore('states').put(cur); }
  }
  for (const r of unsynced) { r.synced = 1; tx.objectStore('reviews').put(r); }
  await tx.done;
}

// Background schedule
let timer: number | undefined;
export function scheduleSync(delayMs = 15000) {
  clearTimeout(timer);
  timer = window.setTimeout(() => { sync(); }, delayMs);
}
let started = false;
export function startAutoSync() {
  sync();
  if (started) return;
  started = true;
  window.addEventListener('online', () => { S.online = true; emit(); sync(); });
  window.addEventListener('offline', () => { S.online = false; emit(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
    else scheduleSync(0);
  });
  setInterval(() => sync(), 5 * 60 * 1000);
}
