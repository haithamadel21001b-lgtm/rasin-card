// Demo backend: runs the exact same SQL as Supabase, inside the browser (PGlite).
import { PGlite } from '@electric-sql/pglite';
import rawSql from '../../../supabase/setup.sql?raw';

// The demo has no pgcrypto, so it gets small stand-ins (demo only; Supabase uses the real thing).
const SHIM = `
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $f$
  select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $f$;
create or replace function extensions.gen_salt(t text) returns text language sql volatile as $f$
  select '$demo$' || md5(random()::text) $f$;
create or replace function extensions.crypt(p text, salt text) returns text language sql immutable as $f$
  select left(salt, 38) || md5(left(salt, 38) || p) $f$;
`;
const setupSql = rawSql.replace(/create extension if not exists pgcrypto[^;]*;/, () => SHIM);
import { DEMO_DECKS, DEMO_MEDIA } from './demoSeed';
import { expandRows } from './cardfile';

type Sig = { name: string; type: string }[];
let ready: Promise<{ db: PGlite; sigs: Map<string, Sig> }> | null = null;

async function open(): Promise<PGlite> {
  const fsBundle = await (await fetch(new URL('assets/pglite-fs.wasm', document.baseURI))).blob();
  try {
    const db = new PGlite('idb://rasin-demo-v2', { fsBundle });
    await db.waitReady;
    return db;
  } catch {
    const db = new PGlite({ fsBundle });
    await db.waitReady;
    return db;
  }
}

async function init() {
  const db = await open();
  const has = await db.query<{ t: string | null }>(`select to_regclass('public.cards')::text as t`);
  if (!has.rows[0].t) {
    await db.exec(setupSql);
    await seed(db);
  }
  const r = await db.query<{ proname: string; a: string }>(
    `select p.proname, pg_get_function_identity_arguments(p.oid) a
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
  );
  const sigs = new Map<string, Sig>();
  for (const row of r.rows) {
    const args = row.a ? row.a.split(', ').map((s) => {
      const i = s.indexOf(' ');
      return { name: s.slice(0, i), type: s.slice(i + 1) };
    }) : [];
    sigs.set(row.proname, args);
  }
  return { db, sigs };
}

async function call(db: PGlite, sigs: Map<string, Sig>, fn: string, args: Record<string, unknown>) {
  const sig = sigs.get(fn);
  if (!sig) throw new Error('NO_FUNCTION ' + fn);
  const params = sig.map((s) => {
    const v = args[s.name];
    if (v === undefined || v === null) return null;
    return s.type === 'jsonb' ? JSON.stringify(v) : String(v);
  });
  const sql = `select public.${fn}(${sig.map((s, i) => `${s.name} => $${i + 1}::text::${s.type}`).join(', ')}) as r`;
  const res = await db.query<{ r: any }>(sql, params);
  return res.rows[0]?.r;
}

async function seed(db: PGlite) {
  const sigs0 = new Map<string, Sig>();
  const r = await db.query<{ proname: string; a: string }>(
    `select p.proname, pg_get_function_identity_arguments(p.oid) a
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
  );
  for (const row of r.rows) sigs0.set(row.proname, row.a ? row.a.split(', ').map((s) => {
    const i = s.indexOf(' ');
    return { name: s.slice(0, i), type: s.slice(i + 1) };
  }) : []);
  const { token } = await call(db, sigs0, 'admin_set_password', { p_new: 'demo1234', p_old: null });
  for (const d of DEMO_DECKS) {
    const { id } = await call(db, sigs0, 'admin_save_deck', { p_token: token, p_id: null, p_name: d.name, p_description: d.description, p_position: null });
    const rows = d.rows.map((x) => ({ ...x, front: x.front.replace(/!\[\]\(([^)]+)\)/g, `![](${id}/$1)`) }));
    const cards = await expandRows(rows, d.name);
    await call(db, sigs0, 'admin_upsert_cards', { p_token: token, p_deck_id: id, p_cards: cards });
    const media = DEMO_MEDIA.filter((m) => d.rows.some((x) => x.front.includes(m.name)))
      .map((m) => ({ name: `${id}/${m.name}`, mime: m.mime, data: m.data }));
    if (media.length) await call(db, sigs0, 'admin_upsert_media', { p_token: token, p_items: media });
  }
  await db.query(`insert into access_codes(code, label, expires_at, max_devices)
                  values ('DEMO2026', 'طالب تجريبي', now() + interval '1 year', 50)`);
}

export async function demoRpc(fn: string, args: Record<string, unknown>) {
  ready ??= init();
  const { db, sigs } = await ready;
  return call(db, sigs, fn, args);
}
