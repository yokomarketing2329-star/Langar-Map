-- =====================================================================
-- Bhandara Map — database schema, security and business rules
-- Run this ONCE in Supabase > SQL Editor (paste the whole file, press Run).
-- Safe to re-run: it uses "if not exists" / "create or replace".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.bhandaras (
  id                   uuid primary key default gen_random_uuid(),
  short_id             text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  name                 text check (name is null or char_length(name) <= 100),
  latitude             double precision not null check (latitude between -90 and 90),
  longitude            double precision not null check (longitude between -180 and 180),
  address              text check (address is null or char_length(address) <= 300),
  food_menu            text not null check (char_length(food_menu) between 2 and 300),
  notes                text check (notes is null or char_length(notes) <= 500),
  photo_url            text not null check (char_length(photo_url) <= 500),
  status               text not null default 'active' check (status in ('active','inactive')),
  created_at           timestamptz not null default now(),
  last_verified_at     timestamptz not null default now(),   -- last valid ACTIVE confirmation
  expires_at           timestamptz not null default (now() + interval '12 hours'),
  evening_confirmed_at timestamptz,                          -- last confirmation made after 6 PM IST
  created_by           text,                                 -- unused (kept for schema compatibility); creator hash lives in bhandara_updates
  updated_at           timestamptz not null default now()
);

create index if not exists bhandaras_expires_idx on public.bhandaras (expires_at);
create index if not exists bhandaras_geo_idx     on public.bhandaras (latitude, longitude);
create index if not exists bhandaras_verified_idx on public.bhandaras (last_verified_at desc);

create table if not exists public.bhandara_updates (
  id                 bigint generated always as identity primary key,
  bhandara_id        uuid references public.bhandaras(id) on delete cascade,
  update_type        text not null check (update_type in
                       ('created','confirm_active','mark_inactive','details_updated','photo_replaced','location_corrected')),
  previous_status    text,
  new_status         text,
  photo_url          text,
  created_at         timestamptz not null default now(),
  visitor_identifier text not null
);
create index if not exists updates_bhandara_idx on public.bhandara_updates (bhandara_id, created_at desc);
create index if not exists updates_visitor_idx  on public.bhandara_updates (visitor_identifier, created_at desc);

create table if not exists public.reports (
  id                bigint generated always as identity primary key,
  bhandara_id       uuid references public.bhandaras(id) on delete cascade,
  reason            text not null check (char_length(reason) between 3 and 300),
  created_at        timestamptz not null default now(),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','dismissed','actioned')),
  visitor_identifier text not null
);
create index if not exists reports_status_idx on public.reports (moderation_status, created_at desc);

create table if not exists public.blocked_visitors (
  visitor_identifier text primary key,
  reason             text,
  created_at         timestamptz not null default now()
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
-- Visitor ids are hashed before being stored so raw ids are never kept.
create or replace function public.hash_visitor(v text) returns text
language sql immutable as $$ select encode(sha256(convert_to('bm-salt-v1:' || coalesce(v,''), 'UTF8')), 'hex') $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

-- The most recent 6:00 PM IST moment that has already passed.
create or replace function public.last_6pm_ist(at_time timestamptz default now()) returns timestamptz
language sql stable as $$
  select case
    when (at_time at time zone 'Asia/Kolkata')::time >= time '18:00'
      then (date_trunc('day', at_time at time zone 'Asia/Kolkata') + interval '18 hours') at time zone 'Asia/Kolkata'
    else (date_trunc('day', at_time at time zone 'Asia/Kolkata') - interval '6 hours') at time zone 'Asia/Kolkata'
  end
$$;

-- Effective status, computed live (no cron needed):
--   expired  : now >= expires_at                              -> hidden from public
--   inactive : stored inactive, OR last confirmation is older than the latest 6 PM IST
--   active   : otherwise
create or replace function public.effective_status(b public.bhandaras, at_time timestamptz default now()) returns text
language sql stable as $$
  select case
    when at_time >= b.expires_at then 'expired'
    when b.status = 'inactive' then 'inactive'
    when b.last_verified_at < public.last_6pm_ist(at_time) then 'inactive'
    else 'active'
  end
$$;

create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Public shape returned to the app (never includes created_by).
create or replace function public.to_public(b public.bhandaras)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', b.id, 'short_id', b.short_id, 'name', b.name,
    'latitude', b.latitude, 'longitude', b.longitude, 'address', b.address,
    'food_menu', b.food_menu, 'notes', b.notes, 'photo_url', b.photo_url,
    'status', public.effective_status(b),
    'needs_evening_confirmation',
        (b.status = 'active' and now() < b.expires_at and b.last_verified_at < public.last_6pm_ist()),
    'created_at', b.created_at, 'last_verified_at', b.last_verified_at,
    'expires_at', b.expires_at, 'updated_at', b.updated_at,
    'server_now', now())
$$;

-- Abuse checks shared by every write function.
create or replace function public.check_visitor(v text, max_per_hour int default 20) returns text
language plpgsql security definer set search_path = public as $$
declare h text; n int;
begin
  if v is null or char_length(v) < 16 or char_length(v) > 100 then
    raise exception 'invalid_visitor' using errcode = 'P0001';
  end if;
  h := public.hash_visitor(v);
  if exists (select 1 from public.blocked_visitors where visitor_identifier = h) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  select (select count(*) from public.bhandara_updates where visitor_identifier = h and created_at > now() - interval '1 hour')
       + (select count(*) from public.reports where visitor_identifier = h and created_at > now() - interval '1 hour')
    into n;
  if n >= max_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return h;
end $$;

-- Photo URLs must point at OUR storage bucket (stops hot-linking arbitrary/malicious URLs).
create or replace function public.valid_photo_url(u text) returns boolean
language sql immutable as $$
  select u is not null and u ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/bhandara-photos/[A-Za-z0-9._/-]+$'
$$;

-- ---------------------------------------------------------------------
-- Public read RPCs  (the app NEVER reads the table directly)
-- ---------------------------------------------------------------------
create or replace function public.list_bhandaras(min_lat double precision, max_lat double precision,
                                                 min_lng double precision, max_lng double precision)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public.to_public(b) from public.bhandaras b
  where b.expires_at > now()
    and b.latitude between min_lat and max_lat
    and b.longitude between min_lng and max_lng
  order by b.last_verified_at desc
  limit 300
$$;

create or replace function public.get_bhandara(p_short_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.to_public(b) from public.bhandaras b
  where b.short_id = p_short_id and b.expires_at > now()
$$;

create or replace function public.find_duplicates(p_lat double precision, p_lng double precision, p_radius_m double precision default 100)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public.to_public(b) from public.bhandaras b
  where b.expires_at > now()
    and b.latitude between p_lat - 0.002 and p_lat + 0.002
    and b.longitude between p_lng - 0.002 and p_lng + 0.002
    and public.distance_m(p_lat, p_lng, b.latitude, b.longitude) <= p_radius_m
  order by public.distance_m(p_lat, p_lng, b.latitude, b.longitude)
  limit 5
$$;

-- ---------------------------------------------------------------------
-- Public write RPCs (validated, rate-limited)
-- ---------------------------------------------------------------------
create or replace function public.create_bhandara(
  p_visitor text, p_name text, p_lat double precision, p_lng double precision, p_address text,
  p_food_menu text, p_photo_url text, p_status text, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; b public.bhandaras; st text;
begin
  h := public.check_visitor(p_visitor, 10);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001'; end if;
  if p_food_menu is null or char_length(btrim(p_food_menu)) < 2 or char_length(p_food_menu) > 300 then
    raise exception 'invalid_menu' using errcode = 'P0001'; end if;
  if not public.valid_photo_url(p_photo_url) then raise exception 'invalid_photo' using errcode = 'P0001'; end if;
  st := case when p_status = 'inactive' then 'inactive' else 'active' end;

  insert into public.bhandaras (name, latitude, longitude, address, food_menu, notes, photo_url, status, created_by,
                                last_verified_at, expires_at, evening_confirmed_at)
  values (nullif(btrim(p_name),''), p_lat, p_lng, nullif(btrim(p_address),''), btrim(p_food_menu),
          nullif(btrim(p_notes),''), p_photo_url, st, null, now(), now() + interval '12 hours',
          case when (now() at time zone 'Asia/Kolkata')::time >= time '18:00' then now() end)
  returning * into b;

  insert into public.bhandara_updates (bhandara_id, update_type, previous_status, new_status, photo_url, visitor_identifier)
  values (b.id, 'created', null, st, p_photo_url, h);
  return public.to_public(b);
end $$;

-- "Still Active": restarts the 12h countdown. If the 6 PM reset already made it inactive
-- (or it is already stored inactive), a FRESH PHOTO is required (Rule B).
create or replace function public.confirm_active(p_visitor text, p_short_id text, p_photo_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; b public.bhandaras; eff text; prev text;
begin
  h := public.check_visitor(p_visitor);
  select * into b from public.bhandaras where short_id = p_short_id and expires_at > now() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  eff := public.effective_status(b);
  prev := eff;
  if eff <> 'active' and not public.valid_photo_url(p_photo_url) then
    raise exception 'photo_required' using errcode = 'P0001'; end if;
  if p_photo_url is not null and not public.valid_photo_url(p_photo_url) then
    raise exception 'invalid_photo' using errcode = 'P0001'; end if;

  update public.bhandaras set
    status = 'active',
    last_verified_at = now(),
    expires_at = now() + interval '12 hours',
    evening_confirmed_at = case when (now() at time zone 'Asia/Kolkata')::time >= time '18:00' then now() else evening_confirmed_at end,
    photo_url = coalesce(p_photo_url, photo_url),
    updated_at = now()
  where id = b.id returning * into b;

  insert into public.bhandara_updates (bhandara_id, update_type, previous_status, new_status, photo_url, visitor_identifier)
  values (b.id, 'confirm_active', prev, 'active', p_photo_url, h);
  return public.to_public(b);
end $$;

create or replace function public.mark_inactive(p_visitor text, p_short_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; b public.bhandaras; prev text;
begin
  h := public.check_visitor(p_visitor);
  select * into b from public.bhandaras where short_id = p_short_id and expires_at > now() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  prev := public.effective_status(b);
  -- Marking inactive does NOT extend the expiry.
  update public.bhandaras set status = 'inactive', updated_at = now() where id = b.id returning * into b;
  insert into public.bhandara_updates (bhandara_id, update_type, previous_status, new_status, visitor_identifier)
  values (b.id, 'mark_inactive', prev, 'inactive', h);
  return public.to_public(b);
end $$;

-- Update menu / name / notes / photo / location. Does not change status or extend expiry
-- (only an explicit "Still Active" confirmation does that).
create or replace function public.update_details(
  p_visitor text, p_short_id text, p_name text, p_food_menu text, p_notes text, p_photo_url text,
  p_lat double precision default null, p_lng double precision default null, p_address text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; b public.bhandaras; t text;
begin
  h := public.check_visitor(p_visitor);
  select * into b from public.bhandaras where short_id = p_short_id and expires_at > now() for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_food_menu is not null and (char_length(btrim(p_food_menu)) < 2 or char_length(p_food_menu) > 300) then
    raise exception 'invalid_menu' using errcode = 'P0001'; end if;
  if p_photo_url is not null and not public.valid_photo_url(p_photo_url) then
    raise exception 'invalid_photo' using errcode = 'P0001'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180) then
    raise exception 'invalid_location' using errcode = 'P0001'; end if;
  -- A location correction may only move the pin a sensible distance (blocks teleport vandalism).
  if p_lat is not null and public.distance_m(b.latitude, b.longitude, p_lat, p_lng) > 2000 then
    raise exception 'move_too_far' using errcode = 'P0001'; end if;

  t := case when p_lat is not null then 'location_corrected'
            when p_photo_url is not null then 'photo_replaced' else 'details_updated' end;

  update public.bhandaras set
    name = case when p_name is null then name else nullif(btrim(p_name),'') end,
    food_menu = coalesce(nullif(btrim(p_food_menu),''), food_menu),
    notes = case when p_notes is null then notes else nullif(btrim(p_notes),'') end,
    photo_url = coalesce(p_photo_url, photo_url),
    latitude = coalesce(p_lat, latitude), longitude = coalesce(p_lng, longitude),
    address = case when p_lat is not null then nullif(btrim(p_address),'') else address end,
    updated_at = now()
  where id = b.id returning * into b;

  insert into public.bhandara_updates (bhandara_id, update_type, previous_status, new_status, photo_url, visitor_identifier)
  values (b.id, t, null, null, p_photo_url, h);
  return public.to_public(b);
end $$;

create or replace function public.report_bhandara(p_visitor text, p_short_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare h text; bid uuid;
begin
  h := public.check_visitor(p_visitor, 10);
  select id into bid from public.bhandaras where short_id = p_short_id;
  if bid is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 300 then
    raise exception 'invalid_reason' using errcode = 'P0001'; end if;
  insert into public.reports (bhandara_id, reason, visitor_identifier) values (bid, btrim(p_reason), h);
end $$;

-- ---------------------------------------------------------------------
-- Admin RPCs (all check is_admin())
-- ---------------------------------------------------------------------
create or replace function public.admin_list(p_filter text default 'all')
returns table (data jsonb, is_expired boolean, report_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select public.to_public(b) || jsonb_build_object('created_by',
             (select u.visitor_identifier from public.bhandara_updates u where u.bhandara_id = b.id and u.update_type = 'created' limit 1)),
           (b.expires_at <= now()),
           (select count(*) from public.reports r where r.bhandara_id = b.id and r.moderation_status = 'pending')
    from public.bhandaras b
    where case p_filter
            when 'expired' then b.expires_at <= now()
            when 'live' then b.expires_at > now()
            else true end
    order by b.created_at desc limit 500;
end $$;

create or replace function public.admin_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.bhandaras where id = p_id;
end $$;

create or replace function public.admin_reports()
returns table (id bigint, bhandara_id uuid, short_id text, bhandara_name text, food_menu text, photo_url text,
               reason text, created_at timestamptz, moderation_status text, visitor_identifier text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.id, r.bhandara_id, b.short_id, b.name, b.food_menu, b.photo_url, r.reason, r.created_at,
           r.moderation_status, r.visitor_identifier
    from public.reports r left join public.bhandaras b on b.id = r.bhandara_id
    order by (r.moderation_status = 'pending') desc, r.created_at desc limit 200;
end $$;

create or replace function public.admin_resolve_report(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('dismissed','actioned','pending') then raise exception 'invalid_status'; end if;
  update public.reports set moderation_status = p_status where id = p_id;
end $$;

create or replace function public.admin_block_visitor(p_hash text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.blocked_visitors (visitor_identifier, reason) values (p_hash, p_reason)
  on conflict (visitor_identifier) do nothing;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total_submitted', (select count(*) from public.bhandaras),
    'active_now', (select count(*) from public.bhandaras b where public.effective_status(b) = 'active'),
    'pending_reports', (select count(*) from public.reports where moderation_status = 'pending'),
    'blocked_visitors', (select count(*) from public.blocked_visitors),
    'daily', coalesce((select jsonb_agg(d order by d.day desc) from (
        select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, count(*) as submitted
        from public.bhandaras where created_at > now() - interval '14 days' group by 1) d), '[]'::jsonb),
    'updates_daily', coalesce((select jsonb_agg(d order by d.day desc) from (
        select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, count(*) as updates
        from public.bhandara_updates where created_at > now() - interval '14 days' group by 1) d), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Optional tidy-up: permanently remove long-expired rows. The app does NOT depend on this.
create or replace function public.cleanup_expired() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.bhandaras where expires_at < now() - interval '7 days';
  get diagnostics n = row_count; return n;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security: tables are LOCKED. Only RPCs above (security definer) touch them.
-- ---------------------------------------------------------------------
alter table public.bhandaras        enable row level security;
alter table public.bhandara_updates enable row level security;
alter table public.reports          enable row level security;
alter table public.blocked_visitors enable row level security;
alter table public.admins           enable row level security;

drop policy if exists "no direct access" on public.bhandaras;
-- Realtime needs SELECT to broadcast changes; expose only non-expired, non-sensitive rows.
-- (No visitor identifiers are stored in this table.)
drop policy if exists "public read live" on public.bhandaras;
create policy "public read live" on public.bhandaras for select to anon, authenticated
  using (expires_at > now());

-- bhandara_updates / reports / blocked_visitors: RLS on + no policies = nobody can touch them
-- directly. They are only reachable through the secured functions in this file.
drop policy if exists "admin read admins" on public.admins;
create policy "admin read admins" on public.admins for select to authenticated using (user_id = auth.uid());

-- Remove default table privileges from anonymous users, then grant only what is needed.
revoke all on public.bhandaras, public.bhandara_updates, public.reports, public.blocked_visitors, public.admins from anon, authenticated;
grant select on public.bhandaras to anon, authenticated;   -- RLS policy below limits this to non-expired rows
-- Admin dashboard works through the admin_* functions; no extra table privileges are needed.
grant select on public.admins to authenticated;

-- Function permissions: lock everything down, then open only the public API.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.list_bhandaras(double precision,double precision,double precision,double precision),
  public.get_bhandara(text),
  public.find_duplicates(double precision,double precision,double precision),
  public.create_bhandara(text,text,double precision,double precision,text,text,text,text,text),
  public.confirm_active(text,text,text),
  public.mark_inactive(text,text),
  public.update_details(text,text,text,text,text,text,double precision,double precision,text),
  public.report_bhandara(text,text,text)
  to anon, authenticated;
grant execute on function
  public.admin_list(text), public.admin_delete(uuid), public.admin_reports(),
  public.admin_resolve_report(bigint,text), public.admin_block_visitor(text,text), public.admin_stats(),
  public.is_admin()
  to authenticated;
-- Helpers used inside RLS policies / views need to be callable by the roles evaluating them.
grant execute on function public.is_admin() to anon;
grant execute on function public.effective_status(public.bhandaras, timestamptz), public.last_6pm_ist(timestamptz),
  public.distance_m(double precision,double precision,double precision,double precision) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime: broadcast changes on the bhandaras table
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.bhandaras;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------------------------------------------------------------------
-- Storage: public photo bucket, 2 MB limit, images only, anonymous upload-only
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bhandara-photos', 'bhandara-photos', true, 2097152, array['image/jpeg','image/webp','image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/webp','image/png'];

drop policy if exists "anyone can view photos" on storage.objects;
create policy "anyone can view photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'bhandara-photos');

drop policy if exists "anyone can upload photos" on storage.objects;
create policy "anyone can upload photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'bhandara-photos' and (storage.foldername(name))[1] = 'uploads');
-- No update/delete policies for anon => uploaded files cannot be overwritten or deleted by the public.

drop policy if exists "admin delete photos" on storage.objects;
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'bhandara-photos' and public.is_admin());
grant execute on function public.is_admin() to anon, authenticated;
