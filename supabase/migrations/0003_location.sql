-- FAMILY TRACKER — Migration 0003 (Tahap 3): berbagi lokasi real-time.
-- Aman dijalankan ulang.

create or replace function public.can_view_location(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or exists (
    select 1 from location_shares s
    where s.user_id = owner and s.is_active
      and (s.expires_at is null or s.expires_at > now())
      and public.is_family_member(s.family_id)
      and exists (select 1 from family_members m
                  where m.family_id = s.family_id and m.user_id = owner and m.status = 'active')) $$;

revoke insert, update, delete on public.current_locations, public.location_shares, public.location_history from authenticated, anon;

drop policy if exists locations_select on public.current_locations;
create policy locations_select on public.current_locations for select to authenticated
  using (public.can_view_location(user_id));

drop policy if exists shares_select on public.location_shares;
create policy shares_select on public.location_shares for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_id));

create or replace function public.start_sharing(p_duration text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); exp timestamptz; n int := 0; fam record; nm text;
begin
  if me is null then raise exception 'Harus login'; end if;
  if p_duration not in ('15m','1h','8h','manual') then raise exception 'Durasi tidak valid'; end if;
  exp := case p_duration when '15m' then now() + interval '15 minutes'
                         when '1h'  then now() + interval '1 hour'
                         when '8h'  then now() + interval '8 hours' else null end;
  select full_name into nm from profiles where id = me;
  for fam in select family_id from family_members where user_id = me and status = 'active' loop
    update location_shares set is_active = false, stopped_at = now()
      where user_id = me and family_id = fam.family_id and is_active;
    insert into location_shares(user_id, family_id, duration, expires_at)
      values (me, fam.family_id, p_duration, exp);
    n := n + 1;
    insert into notifications(recipient_id, sender_id, type, title, body, payload)
      select m.user_id, me, 'sharing_started', 'Berbagi lokasi aktif',
             coalesce(nm, 'Seseorang') || ' mulai berbagi lokasi', jsonb_build_object('family_id', fam.family_id)
      from family_members m where m.family_id = fam.family_id and m.status = 'active' and m.user_id <> me;
  end loop;
  if n = 0 then raise exception 'Gabung ke grup keluarga dulu sebelum berbagi lokasi'; end if;
  insert into audit_logs(actor_id, action, metadata)
    values (me, 'share.start', jsonb_build_object('duration', p_duration, 'families', n));
  return jsonb_build_object('ok', true, 'expires_at', exp, 'families', n);
end $$;

create or replace function public.stop_sharing() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); fams uuid[]; nm text;
begin
  if me is null then raise exception 'Harus login'; end if;
  select array_agg(distinct family_id) into fams from location_shares where user_id = me and is_active;
  update location_shares set is_active = false, stopped_at = now() where user_id = me and is_active;
  delete from current_locations where user_id = me;
  if fams is not null then
    select full_name into nm from profiles where id = me;
    insert into notifications(recipient_id, sender_id, type, title, body)
      select distinct m.user_id, me, 'sharing_stopped', 'Berbagi lokasi dihentikan',
             coalesce(nm, 'Seseorang') || ' berhenti berbagi lokasi'
      from family_members m where m.family_id = any(fams) and m.status = 'active' and m.user_id <> me;
    insert into audit_logs(actor_id, action) values (me, 'share.stop');
  end if;
end $$;

create or replace function public.update_location(p_lat double precision, p_lng double precision, p_acc real default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); last_at timestamptz;
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
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['start_sharing(text)','stop_sharing()','update_location(double precision,double precision,real)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Realtime
do $$
begin
  begin alter publication supabase_realtime add table public.current_locations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.location_shares; exception when duplicate_object then null; end;
end $$;
