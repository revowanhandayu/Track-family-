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
