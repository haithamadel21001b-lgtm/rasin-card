-- =====================================================================
--  بطاقات رصين — database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run again later (it updates functions, keeps your data).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables
create table if not exists app_settings (
  key   text primary key,
  value text not null
);

create table if not exists decks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  position    int  not null default 0,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create table if not exists cards (
  id         text primary key,
  deck_id    uuid not null references decks(id) on delete cascade,
  kind       text not null default 'basic',      -- basic | cloze
  front      text not null,
  back       text not null default '',
  cloze_ord  int,
  tags       text not null default '',
  position   int  not null default 0,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);
create index if not exists cards_updated_idx on cards(updated_at);
create index if not exists cards_deck_idx on cards(deck_id);

create table if not exists media (
  name       text primary key,
  mime       text not null,
  data       text not null,               -- base64
  bytes      int  not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists media_updated_idx on media(updated_at);

create table if not exists access_codes (
  code        text primary key,
  label       text not null default '',
  expires_at  timestamptz not null,
  max_devices int not null default 2,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists devices (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references access_codes(code) on delete cascade,
  device_id   text not null,
  device_name text not null default '',
  token       text not null unique,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (code, device_id)
);

create table if not exists card_states (
  code       text not null references access_codes(code) on delete cascade,
  card_id    text not null,
  state      jsonb not null,
  due        timestamptz,
  updated_at timestamptz not null default now(),
  primary key (code, card_id)
);

create table if not exists reviews (
  code        text not null references access_codes(code) on delete cascade,
  card_id     text not null,
  rating      smallint not null,
  reviewed_at timestamptz not null,
  duration_ms int,
  primary key (code, card_id, reviewed_at)
);
create index if not exists reviews_time_idx on reviews(reviewed_at);

create table if not exists study_time (
  code      text not null references access_codes(code) on delete cascade,
  device_id text not null,
  day       date not null,
  seconds   int  not null default 0,
  primary key (code, device_id, day)
);

create table if not exists admin_sessions (
  token      text primary key,
  expires_at timestamptz not null
);

-- Nobody reads tables directly. Everything goes through the functions below.
alter table app_settings   enable row level security;
alter table decks          enable row level security;
alter table cards          enable row level security;
alter table media          enable row level security;
alter table access_codes   enable row level security;
alter table devices        enable row level security;
alter table card_states    enable row level security;
alter table reviews        enable row level security;
alter table study_time     enable row level security;
alter table admin_sessions enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function _norm_code(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function _new_token() returns text
language sql volatile set search_path = public, extensions as $$
  select encode(gen_random_bytes(24), 'hex')
$$;

-- Returns the access code that owns this device token, or raises.
create or replace function _student(p_token text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  select d.code, c.active, c.expires_at into r
  from devices d join access_codes c on c.code = d.code
  where d.token = p_token;
  if not found then raise exception 'SESSION_INVALID'; end if;
  if not r.active then raise exception 'CODE_DISABLED'; end if;
  if r.expires_at < now() then raise exception 'CODE_EXPIRED'; end if;
  update devices set last_seen = now() where token = p_token;
  return r.code;
end $$;

create or replace function _admin(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from admin_sessions where token = p_token and expires_at > now()) then
    raise exception 'ADMIN_SESSION_INVALID';
  end if;
end $$;

-- ================================================================ STUDENT
create or replace function redeem_code(p_code text, p_device_id text, p_device_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c record; v_token text; n int;
begin
  select * into c from access_codes where code = _norm_code(p_code);
  if not found then raise exception 'CODE_NOT_FOUND'; end if;
  if not c.active then raise exception 'CODE_DISABLED'; end if;
  if c.expires_at < now() then raise exception 'CODE_EXPIRED'; end if;
  if coalesce(length(p_device_id), 0) < 8 then raise exception 'BAD_DEVICE'; end if;

  v_token := _new_token();
  update devices set token = v_token, last_seen = now(), device_name = coalesce(p_device_name, '')
   where code = c.code and device_id = p_device_id;
  if not found then
    select count(*) into n from devices where code = c.code;
    if n >= c.max_devices then raise exception 'DEVICE_LIMIT'; end if;
    insert into devices(code, device_id, device_name, token)
    values (c.code, p_device_id, coalesce(p_device_name, ''), v_token);
  end if;
  return jsonb_build_object('token', v_token, 'label', c.label, 'code', c.code,
                            'expires_at', c.expires_at, 'server_time', now());
end $$;

create or replace function check_in(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; c record;
begin
  v_code := _student(p_token);
  select * into c from access_codes where code = v_code;
  return jsonb_build_object('label', c.label, 'code', c.code, 'expires_at', c.expires_at,
                            'server_time', now());
end $$;

-- Content changed since p_since (null = everything).
create or replace function get_content(p_token text, p_since timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_since timestamptz := coalesce(p_since - interval '2 minutes', '-infinity'::timestamptz);
begin
  perform _student(p_token);
  return jsonb_build_object(
    'server_time', now(),
    'full', p_since is null,
    'decks', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'description', description, 'position', position, 'deleted', deleted)
        order by position, name) from decks), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'deck_id', deck_id, 'kind', kind, 'front', front, 'back', back,
        'cloze_ord', cloze_ord, 'tags', tags, 'position', position, 'deleted', deleted))
        from cards where updated_at > v_since and (p_since is not null or not deleted)), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'updated_at', updated_at))
        from media where updated_at > v_since), '[]'::jsonb)
  );
end $$;

create or replace function get_media(p_token text, p_names jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _student(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'mime', mime, 'data', data))
    from media where name in (select jsonb_array_elements_text(p_names))), '[]'::jsonb);
end $$;

create or replace function sync_progress(p_token text, p_device_id text, p_states jsonb, p_reviews jsonb, p_time jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  v_code := _student(p_token);

  insert into card_states(code, card_id, state, due, updated_at)
  select v_code, s->>'card_id', s->'state', (s->>'due')::timestamptz, (s->>'updated_at')::timestamptz
  from jsonb_array_elements(coalesce(p_states, '[]')) s
  on conflict (code, card_id) do update
    set state = excluded.state, due = excluded.due, updated_at = excluded.updated_at
    where card_states.updated_at < excluded.updated_at;

  insert into reviews(code, card_id, rating, reviewed_at, duration_ms)
  select v_code, r->>'card_id', (r->>'rating')::smallint, (r->>'reviewed_at')::timestamptz,
         (r->>'duration_ms')::int
  from jsonb_array_elements(coalesce(p_reviews, '[]')) r
  on conflict do nothing;

  insert into study_time(code, device_id, day, seconds)
  select v_code, p_device_id, (t->>'day')::date, (t->>'seconds')::int
  from jsonb_array_elements(coalesce(p_time, '[]')) t
  on conflict (code, device_id, day) do update
    set seconds = greatest(study_time.seconds, excluded.seconds);

  return jsonb_build_object('ok', true, 'server_time', now());
end $$;

-- Restores progress on a new phone.
create or replace function get_progress(p_token text, p_device_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  v_code := _student(p_token);
  return jsonb_build_object(
    'states', coalesce((select jsonb_agg(jsonb_build_object('card_id', card_id, 'state', state,
        'updated_at', updated_at)) from card_states where code = v_code), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('card_id', card_id, 'rating', rating,
        'reviewed_at', reviewed_at, 'duration_ms', duration_ms))
        from reviews where code = v_code and reviewed_at > now() - interval '400 days'), '[]'::jsonb),
    'time', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'seconds', s)) from (
        select day, sum(seconds) s from study_time
        where code = v_code and device_id <> coalesce(p_device_id, '') group by day) x), '[]'::jsonb)
  );
end $$;

-- ================================================================ ADMIN
create or replace function admin_status()
returns jsonb language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('has_password',
    exists (select 1 from app_settings where key = 'admin_password'))
$$;

create or replace function _admin_session() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text := _new_token();
begin
  delete from admin_sessions where expires_at < now();
  insert into admin_sessions(token, expires_at) values (v, now() + interval '30 days');
  return v;
end $$;

-- First run: sets the password. Later: needs the old password to change it.
create or replace function admin_set_password(p_new text, p_old text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if length(coalesce(p_new, '')) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  select value into h from app_settings where key = 'admin_password';
  if h is not null and (p_old is null or crypt(p_old, h) <> h) then
    raise exception 'WRONG_PASSWORD';
  end if;
  insert into app_settings(key, value) values ('admin_password', crypt(p_new, gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
  delete from admin_sessions;
  return jsonb_build_object('token', _admin_session());
end $$;

create or replace function admin_login(p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select value into h from app_settings where key = 'admin_password';
  if h is null or crypt(coalesce(p_password, ''), h) <> h then
    perform pg_sleep(1);
    raise exception 'WRONG_PASSWORD';
  end if;
  return jsonb_build_object('token', _admin_session());
end $$;

create or replace function admin_list_decks(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'description', d.description, 'position', d.position,
      'updated_at', d.updated_at,
      'cards', (select count(*) from cards c where c.deck_id = d.id and not c.deleted),
      'images', (select count(*) from media m where m.name like d.id::text || '/%'))
    order by d.position, d.name) from decks d where not d.deleted), '[]'::jsonb);
end $$;

create or replace function admin_save_deck(p_token text, p_id uuid, p_name text, p_description text, p_position int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  perform _admin(p_token);
  if p_id is null then
    insert into decks(name, description, position)
    values (p_name, coalesce(p_description, ''),
            coalesce(p_position, (select coalesce(max(position), 0) + 1 from decks)))
    returning id into v;
  else
    update decks set name = coalesce(p_name, name), description = coalesce(p_description, description),
      position = coalesce(p_position, position), updated_at = now()
    where id = p_id returning id into v;
  end if;
  return jsonb_build_object('id', v);
end $$;

create or replace function admin_delete_deck(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  update decks set deleted = true, updated_at = now() where id = p_id;
  update cards set deleted = true, updated_at = now() where deck_id = p_id and not deleted;
  delete from media where name like p_id::text || '/%';
  return jsonb_build_object('ok', true);
end $$;

-- p_cards: [{id, kind, front, back, cloze_ord, tags, position}]
create or replace function admin_upsert_cards(p_token text, p_deck_id uuid, p_cards jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform _admin(p_token);
  with up as (
    insert into cards(id, deck_id, kind, front, back, cloze_ord, tags, position, updated_at, deleted)
    select c->>'id', p_deck_id, coalesce(c->>'kind', 'basic'), c->>'front', coalesce(c->>'back', ''),
           (c->>'cloze_ord')::int, coalesce(c->>'tags', ''), coalesce((c->>'position')::int, 0), now(), false
    from jsonb_array_elements(p_cards) c
    on conflict (id) do update set
      deck_id = excluded.deck_id, kind = excluded.kind, front = excluded.front, back = excluded.back,
      cloze_ord = excluded.cloze_ord, tags = excluded.tags, position = excluded.position,
      updated_at = now(), deleted = false
    where (cards.deck_id, cards.kind, cards.front, cards.back, cards.cloze_ord, cards.tags, cards.position, cards.deleted)
      is distinct from (excluded.deck_id, excluded.kind, excluded.front, excluded.back, excluded.cloze_ord,
                        excluded.tags, excluded.position, false)
    returning 1)
  select count(*) into n from up;
  update decks set updated_at = now() where id = p_deck_id;
  return jsonb_build_object('changed', n);
end $$;

-- After a "replace" upload: remove cards of this deck that were not in the new file.
create or replace function admin_prune_deck(p_token text, p_deck_id uuid, p_keep_ids jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform _admin(p_token);
  with del as (
    update cards set deleted = true, updated_at = now()
    where deck_id = p_deck_id and not deleted
      and id not in (select jsonb_array_elements_text(p_keep_ids))
    returning 1)
  select count(*) into n from del;
  return jsonb_build_object('removed', n);
end $$;

-- p_items: [{name, mime, data(base64)}]
create or replace function admin_upsert_media(p_token text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform _admin(p_token);
  with up as (
    insert into media(name, mime, data, bytes, updated_at)
    select m->>'name', m->>'mime', m->>'data', (length(m->>'data') * 3 / 4), now()
    from jsonb_array_elements(p_items) m
    on conflict (name) do update set mime = excluded.mime, data = excluded.data,
      bytes = excluded.bytes, updated_at = now()
    where media.data is distinct from excluded.data
    returning 1)
  select count(*) into n from up;
  return jsonb_build_object('changed', n);
end $$;

create or replace function admin_list_cards(p_token text, p_deck_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'deck_id', deck_id, 'kind', kind, 'front', front,
      'back', back, 'cloze_ord', cloze_ord, 'tags', tags, 'position', position) order by position, id)
    from cards where deck_id = p_deck_id and not deleted), '[]'::jsonb);
end $$;

create or replace function admin_update_card(p_token text, p_id text, p_front text, p_back text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  update cards set front = p_front, back = p_back, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_delete_card(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  update cards set deleted = true, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_get_media(p_token text, p_names jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'mime', mime, 'data', data))
    from media where name in (select jsonb_array_elements_text(p_names))), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------- access codes
create or replace function admin_create_codes(p_token text, p_count int, p_labels jsonb,
                                              p_expires_at timestamptz, p_max_devices int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v text; b bytea; i int; k int; out jsonb := '[]'::jsonb; lbl text;
begin
  perform _admin(p_token);
  if p_count < 1 or p_count > 500 then raise exception 'BAD_COUNT'; end if;
  for k in 1..p_count loop
    loop
      b := gen_random_bytes(8); v := '';
      for i in 0..7 loop
        v := v || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
      end loop;
      exit when not exists (select 1 from access_codes where code = v);
    end loop;
    lbl := coalesce(p_labels->>(k - 1), '');
    insert into access_codes(code, label, expires_at, max_devices)
    values (v, lbl, p_expires_at, coalesce(p_max_devices, 2));
    out := out || jsonb_build_object('code', v, 'label', lbl);
  end loop;
  return out;
end $$;

create or replace function admin_list_codes(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return coalesce((select jsonb_agg(row order by (row->>'created_at') desc) from (
    select jsonb_build_object(
      'code', c.code, 'label', c.label, 'expires_at', c.expires_at, 'max_devices', c.max_devices,
      'active', c.active, 'created_at', c.created_at,
      'devices', (select coalesce(jsonb_agg(jsonb_build_object('name', d.device_name,
                  'last_seen', d.last_seen, 'created_at', d.created_at)), '[]'::jsonb)
                  from devices d where d.code = c.code),
      'last_seen', (select max(d.last_seen) from devices d where d.code = c.code),
      'reviews_total', (select count(*) from reviews r where r.code = c.code),
      'reviews_7d', (select count(*) from reviews r where r.code = c.code
                       and r.reviewed_at > now() - interval '7 days'),
      'again_7d', (select count(*) from reviews r where r.code = c.code and r.rating = 1
                       and r.reviewed_at > now() - interval '7 days'),
      'seconds_7d', (select coalesce(sum(seconds), 0) from study_time t where t.code = c.code
                       and t.day > current_date - 7),
      'seconds_total', (select coalesce(sum(seconds), 0) from study_time t where t.code = c.code),
      'learned', (select count(*) from card_states s join cards k on k.id = s.card_id and not k.deleted
                    where s.code = c.code and (s.state->>'state')::int > 0),
      'active_days', (select coalesce(jsonb_agg(distinct (r.reviewed_at at time zone 'Asia/Baghdad')::date), '[]'::jsonb)
                    from reviews r where r.code = c.code and r.reviewed_at > now() - interval '60 days')
    ) as row from access_codes c) x), '[]'::jsonb);
end $$;

create or replace function admin_update_code(p_token text, p_code text, p_label text,
       p_expires_at timestamptz, p_max_devices int, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  update access_codes set
    label = coalesce(p_label, label), expires_at = coalesce(p_expires_at, expires_at),
    max_devices = coalesce(p_max_devices, max_devices), active = coalesce(p_active, active)
  where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_reset_devices(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  delete from devices where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_delete_code(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  delete from access_codes where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------- insights
create or replace function admin_overview(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_token);
  return jsonb_build_object(
    'students', (select count(*) from access_codes where active and expires_at > now()),
    'joined', (select count(distinct code) from devices),
    'active_today', (select count(distinct code) from reviews
                       where (reviewed_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date),
    'active_7d', (select count(distinct code) from reviews where reviewed_at > now() - interval '7 days'),
    'cards', (select count(*) from cards where not deleted),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'reviews', n, 'students', s) order by d) from (
        select (reviewed_at at time zone 'Asia/Baghdad')::date d, count(*) n, count(distinct code) s
        from reviews where reviewed_at > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'hard_cards', coalesce((select jsonb_agg(row) from (
        select jsonb_build_object('id', k.id, 'front', k.front, 'deck', d.name,
          'reviews', count(*), 'again', count(*) filter (where r.rating = 1),
          'students', count(distinct r.code)) as row
        from reviews r join cards k on k.id = r.card_id and not k.deleted
        join decks d on d.id = k.deck_id
        where r.reviewed_at > now() - interval '30 days'
        group by k.id, k.front, d.name
        having count(*) >= 3
        order by (count(*) filter (where r.rating = 1))::float / count(*) desc, count(*) desc
        limit 15) y), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------- permissions
revoke all on function _student(text) from public;
revoke all on function _admin(text) from public;
revoke all on function _admin_session() from public;
revoke all on function _new_token() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'revoke all on function _student(text), _admin(text), _admin_session(), _new_token() from anon, authenticated';
    execute 'grant execute on function redeem_code(text,text,text), check_in(text), get_content(text,timestamptz),
      get_media(text,jsonb), sync_progress(text,text,jsonb,jsonb,jsonb), get_progress(text,text),
      admin_status(), admin_set_password(text,text), admin_login(text), admin_list_decks(text),
      admin_save_deck(text,uuid,text,text,int), admin_delete_deck(text,uuid), admin_upsert_cards(text,uuid,jsonb),
      admin_prune_deck(text,uuid,jsonb), admin_upsert_media(text,jsonb), admin_list_cards(text,uuid),
      admin_update_card(text,text,text,text), admin_delete_card(text,text), admin_get_media(text,jsonb),
      admin_create_codes(text,int,jsonb,timestamptz,int), admin_list_codes(text),
      admin_update_code(text,text,text,timestamptz,int,boolean), admin_reset_devices(text,text),
      admin_delete_code(text,text), admin_overview(text) to anon, authenticated';
  end if;
end $$;
