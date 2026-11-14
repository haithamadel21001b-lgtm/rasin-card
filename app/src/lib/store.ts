// Local, on-device storage. Card text and images are kept encrypted.
import { openDB, type IDBPDatabase } from 'idb';
import { useSyncExternalStore } from 'react';

export type Session = { token: string; code: string; label: string; expires_at: string };
export type Deck = { id: string; name: string; description: string; position: number; deleted?: boolean };
export type Card = {
  id: string; deck_id: string; kind: 'basic' | 'cloze'; front: string; back: string;
  cloze_ord: number | null; tags: string; position: number;
};
export type StoredCard = Record<string, any>;
export type StateRec = { card_id: string; card: StoredCard; updated_at: string; dirty: 0 | 1 };
export type ReviewRec = { id?: number; card_id: string; rating: number; reviewed_at: string; duration_ms: number; synced: 0 | 1 };
export type Settings = { newPerDay: number };

let dbp: Promise<IDBPDatabase> | null = null;
export function db() {
  return (dbp ??= openDB('rasin', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('decks', { keyPath: 'id' });
      d.createObjectStore('cards', { keyPath: 'id' });
      d.createObjectStore('media', { keyPath: 'name' });
      d.createObjectStore('states', { keyPath: 'card_id' });
      d.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('time', { keyPath: 'day' });
    },
  }));
}

export async function kvGet<T = any>(k: string): Promise<T | undefined> {
  return (await db()).get('kv', k);
}
export async function kvSet(k: string, v: unknown) {
  return (await db()).put('kv', v, k);
}

// ---------------------------------------------------------------- crypto
let keyP: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  return (keyP ??= (async () => {
    let k = await kvGet<CryptoKey>('ck');
    if (!k) {
      k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await kvSet('ck', k);
    }
    return k;
  })());
}
export async function encBytes(bytes: BufferSource) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), bytes);
  return { iv, data };
}
export async function decBytes(iv: Uint8Array, data: ArrayBuffer) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await key(), data);
}
export async function encJson(obj: unknown) {
  return encBytes(new TextEncoder().encode(JSON.stringify(obj)));
}
export async function decJson<T>(iv: Uint8Array, data: ArrayBuffer): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decBytes(iv, data)));
}

// ---------------------------------------------------------------- memory state
export const S = {
  ready: false,
  session: null as Session | null,
  deviceId: '',
  decks: [] as Deck[],
  cards: new Map<string, Card>(),
  states: new Map<string, StateRec>(),
  reviews: [] as ReviewRec[],
  time: new Map<string, number>(),
  remoteTime: {} as Record<string, number>,
  settings: { newPerDay: 20 } as Settings,
  lastContact: 0,
  lastSync: null as string | null,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  mediaPending: 0,
  firstLoad: false,
  notice: '' as string,
};

let version = 0;
const listeners = new Set<() => void>();
export function emit() {
  version++;
  listeners.forEach((l) => l());
}
export function useStore() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => version,
  );
}

function makeId() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadAll() {
  const d = await db();
  let deviceId = await kvGet<string>('deviceId');
  if (!deviceId) {
    try { deviceId = localStorage.getItem('rasin.deviceId') ?? undefined; } catch { /* ignore */ }
    deviceId ??= makeId();
    await kvSet('deviceId', deviceId);
  }
  try { localStorage.setItem('rasin.deviceId', deviceId); } catch { /* ignore */ }
  S.deviceId = deviceId;
  S.session = (await kvGet<Session>('session')) ?? null;
  S.settings = { newPerDay: 20, ...((await kvGet<Settings>('settings')) ?? {}) };
  S.lastContact = (await kvGet<number>('lastContact')) ?? 0;
  S.lastSync = (await kvGet<string>('lastSync')) ?? null;
  S.remoteTime = (await kvGet<Record<string, number>>('remoteTime')) ?? {};
  S.decks = ((await d.getAll('decks')) as Deck[]).filter((x) => !x.deleted)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  S.cards = new Map();
  const enc = await d.getAll('cards');
  const dec = await Promise.all(enc.map((r: any) => decJson<Card>(r.iv, r.data).catch(() => null)));
  for (const c of dec) if (c) S.cards.set(c.id, c);
  S.states = new Map(((await d.getAll('states')) as StateRec[]).map((s) => [s.card_id, s]));
  S.reviews = (await d.getAll('reviews')) as ReviewRec[];
  S.time = new Map(((await d.getAll('time')) as { day: string; seconds: number }[]).map((t) => [t.day, t.seconds]));
  S.ready = true;
  emit();
}

export async function saveSettings(s: Partial<Settings>) {
  S.settings = { ...S.settings, ...s };
  await kvSet('settings', S.settings);
  emit();
}

/** Removes everything except the device id (used when access ends). */
export async function wipe(notice = '') {
  const d = await db();
  for (const st of ['decks', 'cards', 'media', 'states', 'reviews', 'time'] as const) await d.clear(st);
  for (const k of ['session', 'lastContact', 'lastSync', 'remoteTime', 'mediaPending']) await d.delete('kv', k);
  mediaCache.forEach((u) => URL.revokeObjectURL(u));
  mediaCache.clear();
  Object.assign(S, {
    session: null, decks: [], cards: new Map(), states: new Map(), reviews: [], time: new Map(),
    remoteTime: {}, lastContact: 0, lastSync: null, notice,
  });
  emit();
}

// ---------------------------------------------------------------- media
const mediaCache = new Map<string, string>();
export async function mediaUrl(name: string): Promise<string | undefined> {
  if (mediaCache.has(name)) return mediaCache.get(name);
  const r: any = await (await db()).get('media', name);
  if (!r) return undefined;
  const bytes = await decBytes(r.iv, r.data);
  const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
  mediaCache.set(name, url);
  return url;
}
export function dropMediaCache(name: string) {
  const u = mediaCache.get(name);
  if (u) URL.revokeObjectURL(u);
  mediaCache.delete(name);
}

// ---------------------------------------------------------------- study time
const DAY_START_HOUR = 4;
export function dayKey(d: Date | number = new Date()) {
  const t = new Date(typeof d === 'number' ? d : d.getTime());
  t.setHours(t.getHours() - DAY_START_HOUR);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
export function dayEnd(now = new Date()) {
  const t = new Date(now);
  if (t.getHours() >= DAY_START_HOUR) t.setDate(t.getDate() + 1);
  t.setHours(DAY_START_HOUR, 0, 0, 0);
  return t;
}
export async function addStudySeconds(sec: number) {
  if (sec <= 0) return;
  const k = dayKey();
  const v = (S.time.get(k) ?? 0) + sec;
  S.time.set(k, v);
  await (await db()).put('time', { day: k, seconds: v });
  emit();
}
export function totalSeconds(day: string) {
  return (S.time.get(day) ?? 0) + (S.remoteTime[day] ?? 0);
}
