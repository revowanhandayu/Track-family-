-- FAMILY TRACKER — Migration 0007: push, tempat (geofence), baterai/kecepatan, chat. Aman dijalankan ulang.

-- ===== Push =====
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from authenticated, anon; -- kunci langganan tidak bisa dibaca pengguna

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Endpoint tidak valid'; end if;
  insert into push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() $$;

create or replace function public.has_push_subscription(p_endpoint text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()) $$;

create or replace function public.save_notify(p_sos boolean, p_members boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  insert into user_settings(user_id, notify_sos, notify_members) values (auth.uid(), p_sos, p_members)
  on conflict (user_id) do update set notify_sos = p_sos, notify_members = p_members, updated_at = now();
end $$;

-- ===== Baterai & kecepatan =====
alter table public.current_locations add column if not exists battery_pct smallint check (battery_pct between 0 and 100);
alter table public.current_locations add column if not exists charging boolean;
alter table public.current_locations add column if not exists speed_mps real check (speed_mps >= 0);

drop function if exists public.update_location(double precision, double precision, real);
create or replace function public.update_location(p_lat double precision, p_lng double precision, p_acc real default null,
  p_batt int default null, p_charging boolean default null, p_speed real default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); last_at timestamptz; hist boolean; ret text;
        lh record; dist double precision; sid uuid;
begin
  if me is null then raise exception 'Harus login'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    then raise exception 'Koordinat tidak valid'; end if;

  update location_shares set is_active = false, stopped_at = now()
    where user_id = me and is_active and expires_at is not null and expires_at <= now();

  if not exists (select 1 from location_shares where user_id = me and is_active) then
    delete from current_locations where user_id = me;
    return jsonb_build_object('ok', false, 'reason', 'not_sharing');
  end if;

  select recorded_at into last_at from current_locations where user_id = me;
  if last_at is not null and last_at > now() - interval '3 seconds' then
    return jsonb_build_object('ok', true, 'throttled', true);
  end if;

  insert into current_locations(user_id, latitude, longitude, accuracy_m, battery_pct, charging, speed_mps, recorded_at)
    values (me, p_lat, p_lng, case when p_acc is null then null else greatest(p_acc, 0) end,
            case when p_batt is null then null else least(greatest(p_batt, 0), 100) end,
            p_charging, case when p_speed is null then null else greatest(p_speed, 0) end, now())
  on conflict (user_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude, accuracy_m = excluded.accuracy_m,
        battery_pct = excluded.battery_pct, charging = excluded.charging, speed_mps = excluded.speed_mps, recorded_at = now();

  select history_enabled, history_retention into hist, ret from user_settings where user_id = me;
  if coalesce(hist, false) and (p_acc is null or p_acc <= 200) then
    select latitude, longitude, recorded_at into lh from location_history where user_id = me order by recorded_at desc limit 1;
    dist := case when lh.recorded_at is null then null
      else sqrt(power(p_lat - lh.latitude, 2) + power((p_lng - lh.longitude) * cos(radians(p_lat)), 2)) * 111320 end;
    if lh.recorded_at is null or dist >= 25 or lh.recorded_at < now() - interval '5 minutes' then
      select id into sid from location_shares where user_id = me and is_active limit 1;
      insert into location_history(user_id, share_id, latitude, longitude, accuracy_m, recorded_at, purge_after)
        values (me, sid, p_lat, p_lng, p_acc, now(),
                now() + case ret when '7d' then interval '7 days' when '30d' then interval '30 days' else interval '24 hours' end);
      delete from location_history where user_id = me and purge_after < now();
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ===== Tempat =====
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m int not null check (radius_m between 50 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_places_family on public.places(family_id);

create table if not exists public.place_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  inside boolean not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table public.places enable row level security;
alter table public.place_states enable row level security;
revoke insert, update, delete on public.places from authenticated, anon;
revoke all on table public.place_states from authenticated, anon;

drop policy if exists places_select on public.places;
create policy places_select on public.places for select to authenticated using (public.is_family_member(family_id));

create or replace function public.add_place(p_family uuid, p_name text, p_lat double precision, p_lng double precision, p_radius int) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text := btrim(coalesce(p_name, ''));
begin
  if not public.is_family_member(p_family) then raise exception 'Kamu bukan anggota grup ini'; end if;
  if char_length(nm) not between 1 and 40 then raise exception 'Nama tempat 1-40 karakter'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Koordinat tidak valid'; end if;
  if p_radius not between 50 and 1000 then raise exception 'Radius 50-1000 meter'; end if;
  if (select count(*) from places where family_id = p_family) >= 20 then raise exception 'Maksimal 20 tempat per grup'; end if;
  insert into places(family_id, name, latitude, longitude, radius_m, created_by)
    values (p_family, nm, p_lat, p_lng, p_radius, auth.uid()) returning id into pid;
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'place.add', 'place', pid);
  return pid;
end $$;

create or replace function public.delete_place(p_place uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl places%rowtype;
begin
  select * into pl from places where id = p_place;
  if not found then raise exception 'Tempat tidak ditemukan'; end if;
  if pl.created_by is distinct from auth.uid() and not public.is_family_owner(pl.family_id) then raise exception 'Tidak diizinkan'; end if;
  delete from places where id = p_place;
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'place.delete', 'place', p_place);
end $$;

create or replace function public.report_place_event(p_place uuid, p_event text, p_lat double precision, p_lng double precision, p_acc real default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl places%rowtype; st place_states%rowtype; d double precision; inside boolean; nm text;
begin
  if me is null then raise exception 'Harus login'; end if;
  if p_event not in ('arrive', 'leave') then raise exception 'Peristiwa tidak valid'; end if;
  select * into pl from places where id = p_place;
  if not found or not public.is_family_member(pl.family_id) then raise exception 'Tidak diizinkan'; end if;
  if not exists (select 1 from location_shares where user_id = me and family_id = pl.family_id and is_active
                 and (expires_at is null or expires_at > now())) then
    return jsonb_build_object('ok', false, 'reason', 'not_sharing');
  end if;
  d := sqrt(power(p_lat - pl.latitude, 2) + power((p_lng - pl.longitude) * cos(radians(pl.latitude)), 2)) * 111320;
  inside := (p_event = 'arrive');
  if inside and d > pl.radius_m + 100 then return jsonb_build_object('ok', false, 'reason', 'too_far'); end if;
  if not inside and d < pl.radius_m then return jsonb_build_object('ok', false, 'reason', 'still_inside'); end if;

  select * into st from place_states where user_id = me and place_id = p_place;
  if found then
    if st.inside = inside then return jsonb_build_object('ok', true, 'unchanged', true); end if;
    if st.changed_at > now() - interval '2 minutes' then return jsonb_build_object('ok', true, 'throttled', true); end if;
  end if;
  insert into place_states(user_id, place_id, inside, changed_at) values (me, p_place, inside, now())
    on conflict (user_id, place_id) do update set inside = excluded.inside, changed_at = now();

  select full_name into nm from profiles where id = me;
  with n as (
    insert into notifications(recipient_id, sender_id, type, title, payload)
    select m.user_id, me, case when inside then 'place_arrive' else 'place_leave' end,
           coalesce(nm, 'Anggota') || case when inside then ' tiba di ' else ' meninggalkan ' end || pl.name,
           jsonb_build_object('family_id', pl.family_id, 'place_id', pl.id)
    from family_members m where m.family_id = pl.family_id and m.status = 'active' and m.user_id <> me
    returning id)
  insert into notification_deliveries(notification_id, channel, status, attempts, sent_at)
    select id, 'in_app', 'sent', 1, now() from n;
  insert into audit_logs(actor_id, action, target_type, target_id) values (me, 'place.' || p_event, 'place', p_place);
  return jsonb_build_object('ok', true);
end $$;

-- ===== Chat =====
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_family on public.messages(family_id, created_at desc);
alter table public.messages enable row level security;
revoke insert, update, delete on public.messages from authenticated, anon;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_family_member(family_id));

create or replace function public.send_message(p_family uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); mid uuid; nm text;
begin
  if me is null then raise exception 'Harus login'; end if;
  if not public.is_family_member(p_family) then raise exception 'Kamu bukan anggota grup ini'; end if;
  if char_length(b) not between 1 and 1000 then raise exception 'Pesan 1-1000 karakter'; end if;
  if (select count(*) from messages where sender_id = me and created_at > now() - interval '1 minute') >= 20
    then raise exception 'Terlalu cepat. Tunggu sebentar.'; end if;
  insert into messages(family_id, sender_id, body) values (p_family, me, b) returning id into mid;
  select full_name into nm from profiles where id = me;
  insert into notifications(recipient_id, sender_id, type, title, body, payload)
    select m.user_id, me, 'chat_message', coalesce(nm, 'Anggota'), left(b, 120), jsonb_build_object('family_id', p_family)
    from family_members m where m.family_id = p_family and m.status = 'active' and m.user_id <> me;
  return mid;
end $$;

-- ===== Hak eksekusi + realtime =====
do $$
declare f text;
begin
  foreach f in array array[
    'save_push_subscription(text,text,text,text)','delete_push_subscription(text)','has_push_subscription(text)',
    'save_notify(boolean,boolean)',
    'update_location(double precision,double precision,real,int,boolean,real)',
    'add_place(uuid,text,double precision,double precision,int)','delete_place(uuid)',
    'report_place_event(uuid,text,double precision,double precision,real)','send_message(uuid,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
end $$;
