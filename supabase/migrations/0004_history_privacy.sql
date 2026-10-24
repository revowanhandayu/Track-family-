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
