-- FAMILY TRACKER: JALANKAN FILE INI SEKALI di Supabase SQL Editor (gabungan migration 0004 sampai 0007).
-- Urutan: 0004 riwayat/privasi, 0005 foto profil, 0006 SOS/notifikasi, 0007 push/tempat/chat.

-- ======== 0004_history_privacy ========
-- FAMILY TRACKER — Migration 0004 (Tahap 4): riwayat lokasi, privasi, berbagi 24 jam.
-- Aman dijalankan ulang.

alter table public.location_shares drop constraint if exists location_shares_duration_check;
alter table public.location_shares add constraint location_shares_duration_check
  check (duration in ('15m','1h','8h','24h','manual'));

alter table public.user_settings add column if not exists history_enabled boolean not null default false;

create table if not exists public.history_grants (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);
alter table public.history_grants enable row level security;

create or replace function public.shares_active_family(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members a join family_members b on b.family_id = a.family_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = other and b.status = 'active') $$;

revoke insert, update, delete on public.history_grants, public.user_settings from authenticated, anon;

drop policy if exists grants_select on public.history_grants;
create policy grants_select on public.history_grants for select to authenticated
  using (owner_id = auth.uid() or viewer_id = auth.uid());

drop policy if exists settings_select on public.user_settings;
create policy settings_select on public.user_settings for select to authenticated using (user_id = auth.uid());

drop policy if exists history_select on public.location_history;
create policy history_select on public.location_history for select to authenticated
  using (purge_after > now() and (
    user_id = auth.uid()
    or (exists (select 1 from public.history_grants g where g.owner_id = location_history.user_id and g.viewer_id = auth.uid())
        and public.shares_active_family(user_id))));

create or replace function public.start_sharing_24h() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb; exp timestamptz := now() + interval '24 hours';
begin
  if me is null then raise exception 'Harus login'; end if;
  r := public.start_sharing('manual');
  update location_shares set duration = '24h', expires_at = exp where user_id = me and is_active;
  return r || jsonb_build_object('expires_at', exp);
end $$;

create or replace function public.update_location(p_lat double precision, p_lng double precision, p_acc real default null)
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

  insert into current_locations(user_id, latitude, longitude, accuracy_m, recorded_at)
    values (me, p_lat, p_lng, case when p_acc is null then null else greatest(p_acc, 0) end, now())
  on conflict (user_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m, recorded_at = now();

  -- Riwayat: hanya jika pemilik mengaktifkannya, saat berbagi aktif, dan akurasi cukup baik.
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

create or replace function public.save_privacy(p_history boolean, p_retention text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); iv interval;
begin
  if me is null then raise exception 'Harus login'; end if;
  if p_retention not in ('24h','7d','30d') then raise exception 'Retensi tidak valid'; end if;
  iv := case p_retention when '7d' then interval '7 days' when '30d' then interval '30 days' else interval '24 hours' end;
  insert into user_settings(user_id, history_enabled, history_retention)
    values (me, p_history, p_retention)
  on conflict (user_id) do update set history_enabled = p_history, history_retention = p_retention, updated_at = now();
  delete from location_history where user_id = me and recorded_at < now() - iv;
  update location_history set purge_after = recorded_at + iv where user_id = me;
  insert into audit_logs(actor_id, action, metadata)
    values (me, 'privacy.save', jsonb_build_object('history', p_history, 'retention', p_retention));
end $$;

create or replace function public.delete_my_history() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  delete from location_history where user_id = auth.uid();
  insert into audit_logs(actor_id, action) values (auth.uid(), 'history.delete');
end $$;

create or replace function public.set_history_viewer(p_viewer uuid, p_allow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if p_allow then
    if not public.shares_active_family(p_viewer) then raise exception 'Hanya anggota aktif grupmu yang bisa diberi izin'; end if;
    insert into history_grants(owner_id, viewer_id) values (auth.uid(), p_viewer) on conflict do nothing;
  else
    delete from history_grants where owner_id = auth.uid() and viewer_id = p_viewer;
  end if;
  insert into audit_logs(actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'history.grant', 'profile', p_viewer, jsonb_build_object('allow', p_allow));
end $$;

create or replace function public.purge_expired_history() returns void
language sql security definer set search_path = public as $$
  delete from location_history where purge_after < now() $$;

do $$
declare f text;
begin
  foreach f in array array['start_sharing_24h()','update_location(double precision,double precision,real)',
    'save_privacy(boolean,text)','delete_my_history()','set_history_viewer(uuid,boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.purge_expired_history() from public, anon, authenticated;
end $$;

-- Penghapusan otomatis tiap 30 menit (butuh pg_cron; jika belum aktif, hanya muncul catatan)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-location-history', '*/30 * * * *', 'select public.purge_expired_history()');
exception when others then
  raise notice 'pg_cron belum aktif (%). Titik kedaluwarsa tetap disembunyikan dan dihapus saat perekaman berikutnya.', sqlerrm;
end $$;

-- ======== 0005_avatars ========
-- FAMILY TRACKER — Migration 0005: foto profil (bucket privat + policy). Aman dijalankan ulang.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

-- Folder pertama = id pemilik. Hanya pemilik yang boleh menulis; anggota satu grup boleh membaca.
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.shares_family_with(((storage.foldername(name))[1])::uuid)));

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- avatar_url hanya boleh berisi path file milik sendiri (bukan URL luar yang bisa melacak penonton)
alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_url is null or avatar_url ~ ('^' || id::text || '/[A-Za-z0-9._-]+$'));

-- ======== 0006_alerts ========
-- FAMILY TRACKER — Migration 0006 (Tahap 5a): SOS, Saya Aman, notifikasi. Aman dijalankan ulang.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'family_invite','member_joined','member_left','join_approved','join_denied',
  'sharing_started','sharing_stopped','device_request','request_approved','request_denied',
  'sos','safe','sos_resolved','place_arrive','place_leave','chat_message','security'));

alter table public.safety_alerts add column if not exists request_id uuid;
create unique index if not exists uq_alert_request on public.safety_alerts(user_id, family_id, request_id) where request_id is not null;

revoke insert, update, delete on public.safety_alerts, public.notification_deliveries from authenticated, anon;

drop policy if exists alerts_select on public.safety_alerts;
create policy alerts_select on public.safety_alerts for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_id));

drop policy if exists deliveries_select on public.notification_deliveries;
create policy deliveries_select on public.notification_deliveries for select to authenticated
  using (exists (select 1 from public.notifications n where n.id = notification_id and n.recipient_id = auth.uid()));

create or replace function public._send_alert(p_type text, p_lat double precision, p_lng double precision, p_acc real,
  p_message text, p_request uuid, p_recipients uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; fam record; rec record; aid uuid; nid uuid;
        ids uuid[] := '{}'; total int := 0; recents int; dup uuid[];
begin
  if me is null then raise exception 'Harus login'; end if;
  if p_request is null then raise exception 'Permintaan tidak valid'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180)
    then raise exception 'Koordinat tidak valid'; end if;
  if p_message is not null and char_length(p_message) > 280 then raise exception 'Pesan maksimal 280 karakter'; end if;

  -- Kirim ulang dengan request_id yang sama tidak membuat duplikat
  select array_agg(id) into dup from safety_alerts where user_id = me and request_id = p_request;
  if dup is not null then
    select count(*) into total from notifications n where (n.payload->>'alert_id')::uuid = any(dup);
    return jsonb_build_object('ok', true, 'duplicate', true, 'alert_ids', dup, 'recipients', total,
                              'created_at', now(), 'lat', p_lat, 'lng', p_lng, 'acc', p_acc);
  end if;

  select count(distinct request_id) into recents from safety_alerts
    where user_id = me and created_at > now() - interval '10 minutes';
  if recents >= 6 then raise exception 'Terlalu banyak peringatan dalam waktu singkat. Tunggu beberapa menit.'; end if;

  select full_name into nm from profiles where id = me;
  for fam in select family_id from family_members where user_id = me and status = 'active' loop
    insert into safety_alerts(user_id, family_id, type, latitude, longitude, accuracy_m, message, request_id)
      values (me, fam.family_id, p_type, p_lat, p_lng, p_acc, p_message, p_request) returning id into aid;
    ids := ids || aid;
    for rec in select m.user_id from family_members m
               where m.family_id = fam.family_id and m.status = 'active' and m.user_id <> me
                 and (p_recipients is null or m.user_id = any(p_recipients)) loop
      insert into notifications(recipient_id, sender_id, type, title, body, payload)
        values (rec.user_id, me, p_type,
                case when p_type = 'sos' then 'SOS dari ' || coalesce(nm, 'anggota keluarga')
                     else coalesce(nm, 'Anggota keluarga') || ' dalam keadaan aman' end,
                coalesce(p_message, case when p_type = 'sos' then 'Butuh bantuan segera' else 'Menekan tombol Saya Aman' end),
                jsonb_build_object('alert_id', aid, 'family_id', fam.family_id, 'lat', p_lat, 'lng', p_lng, 'acc', p_acc))
        returning id into nid;
      insert into notification_deliveries(notification_id, channel, status, attempts, sent_at)
        values (nid, 'in_app', 'sent', 1, now());
      total := total + 1;
    end loop;
  end loop;
  if cardinality(ids) = 0 then raise exception 'Gabung ke grup keluarga dulu'; end if;

  insert into audit_logs(actor_id, action, metadata) values (me, 'alert.' || p_type, jsonb_build_object('recipients', total));
  return jsonb_build_object('ok', true, 'alert_ids', ids, 'recipients', total, 'created_at', now(),
                            'lat', p_lat, 'lng', p_lng, 'acc', p_acc);
end $$;

create or replace function public.send_sos(p_lat double precision, p_lng double precision, p_acc real,
  p_message text, p_request uuid) returns jsonb
language sql security definer set search_path = public as $$
  select public._send_alert('sos', p_lat, p_lng, p_acc, p_message, p_request, null) $$;

create or replace function public.send_safe(p_lat double precision, p_lng double precision, p_acc real,
  p_request uuid, p_recipients uuid[]) returns jsonb
language sql security definer set search_path = public as $$
  select public._send_alert('safe', p_lat, p_lng, p_acc, null, p_request, p_recipients) $$;

create or replace function public.alert_status(p_alerts uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'read', count(*) filter (where n.read_at is not null),
    'recipients', coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'read', n.read_at is not null) order by p.full_name), '[]'::jsonb))
  from notifications n
  join safety_alerts a on a.id = (n.payload->>'alert_id')::uuid
  join profiles p on p.id = n.recipient_id
  where a.user_id = auth.uid() and a.id = any(p_alerts) and n.type in ('sos','safe') $$;

create or replace function public.resolve_sos(p_alert uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a safety_alerts%rowtype; r record; nm text;
begin
  select * into a from safety_alerts where id = p_alert and type = 'sos';
  if not found then raise exception 'Peringatan tidak ditemukan'; end if;
  if a.user_id <> auth.uid() and not public.is_family_owner(a.family_id) then raise exception 'Tidak diizinkan'; end if;
  select full_name into nm from profiles where id = a.user_id;
  for r in select * from safety_alerts where user_id = a.user_id and request_id is not distinct from a.request_id and status = 'active' loop
    update safety_alerts set status = 'resolved', resolved_at = now() where id = r.id;
    insert into notifications(recipient_id, sender_id, type, title, body, payload)
      select m.user_id, auth.uid(), 'sos_resolved', 'SOS selesai',
             'SOS dari ' || coalesce(nm, 'anggota keluarga') || ' sudah diakhiri',
             jsonb_build_object('alert_id', r.id, 'family_id', r.family_id)
      from family_members m where m.family_id = r.family_id and m.status = 'active' and m.user_id <> auth.uid();
  end loop;
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'alert.resolve', 'safety_alert', p_alert);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'send_sos(double precision,double precision,real,text,uuid)',
    'send_safe(double precision,double precision,real,uuid,uuid[])',
    'alert_status(uuid[])','resolve_sos(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public._send_alert(text,double precision,double precision,real,text,uuid,uuid[]) from public, anon, authenticated;
end $$;

do $$
begin
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.safety_alerts; exception when duplicate_object then null; end;
end $$;

-- ======== 0007_push_places_chat ========
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

