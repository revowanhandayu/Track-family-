-- FAMILY TRACKER — Migration 0002 (Tahap 2): RLS + RPC untuk grup keluarga.
-- Aman dijalankan ulang. Semua perubahan data grup lewat fungsi SECURITY DEFINER
-- yang memeriksa auth.uid(); klien tidak bisa menulis langsung ke tabel grup.

-- Perketat FK agar penghapusan akun tidak terblokir
alter table public.family_invitations drop constraint if exists family_invitations_used_by_fkey;
alter table public.family_invitations add constraint family_invitations_used_by_fkey
  foreign key (used_by) references public.profiles(id) on delete set null;
alter table public.remote_action_requests drop constraint if exists remote_action_requests_requester_id_fkey;
alter table public.remote_action_requests add constraint remote_action_requests_requester_id_fkey
  foreign key (requester_id) references public.profiles(id) on delete cascade;

-- Tambah jenis notifikasi hasil persetujuan gabung
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'family_invite','member_joined','member_left','join_approved','join_denied',
  'sharing_started','sharing_stopped','device_request','request_approved','request_denied',
  'sos','safe','security'));

-- ---------- Helper (dipakai policy; SECURITY DEFINER agar tidak rekursif) ----------
create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members
    where family_id = fid and user_id = auth.uid() and status = 'active') $$;

create or replace function public.is_family_owner(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members
    where family_id = fid and user_id = auth.uid() and role = 'owner' and status = 'active') $$;

create or replace function public.shares_family_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members a join family_members b on b.family_id = a.family_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = uid and b.status in ('active','pending')) $$;

-- ---------- Hak tabel: tulis langsung dibatasi ----------
revoke insert, update, delete on public.family_members, public.family_invitations from authenticated, anon;
revoke insert, delete on public.families, public.profiles, public.notifications from authenticated, anon;
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
revoke update on public.families from authenticated, anon;
grant update (name, photo_url, require_approval) on public.families to authenticated;
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- ---------- Policy ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_family_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated
  using (public.is_family_member(id));
drop policy if exists families_update on public.families;
create policy families_update on public.families for update to authenticated
  using (public.is_family_owner(id)) with check (public.is_family_owner(id));

drop policy if exists members_select on public.family_members;
create policy members_select on public.family_members for select to authenticated
  using (user_id = auth.uid() or public.is_family_member(family_id));

drop policy if exists invitations_select on public.family_invitations;
create policy invitations_select on public.family_invitations for select to authenticated
  using (public.is_family_owner(family_id));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---------- RPC ----------
create or replace function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid; nm text := btrim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if char_length(nm) not between 2 and 60 then raise exception 'Nama grup harus 2-60 karakter'; end if;
  insert into families(name, owner_id) values (nm, auth.uid()) returning id into fid;
  insert into family_members(family_id, user_id, role, status, joined_at)
    values (fid, auth.uid(), 'owner', 'active', now());
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'family.create', 'family', fid);
  return fid;
end $$;

-- Mengembalikan token mentah SEKALI; di database hanya hash SHA-256 yang disimpan.
create or replace function public.create_invitation(p_family uuid, p_ttl_hours int default 48, p_single_use boolean default true)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text; iid uuid;
begin
  if not public.is_family_owner(p_family) then raise exception 'Hanya pemilik grup yang bisa membuat undangan'; end if;
  if p_ttl_hours not between 1 and 720 then raise exception 'Masa berlaku 1 jam sampai 30 hari'; end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into family_invitations(family_id, invited_by, token_hash, single_use, expires_at)
    values (p_family, auth.uid(), encode(digest(tok, 'sha256'), 'hex'), p_single_use, now() + make_interval(hours => p_ttl_hours))
    returning id into iid;
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'invite.create', 'family_invitation', iid);
  return tok;
end $$;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from family_invitations where id = p_id;
  if fid is null or not public.is_family_owner(fid) then raise exception 'Tidak diizinkan'; end if;
  update family_invitations set status = 'revoked' where id = p_id and status = 'active';
end $$;

-- Hasil dikembalikan sebagai jsonb {ok, error?, status?, family_id?} agar percobaan gagal tetap tercatat.
create or replace function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare inv family_invitations%rowtype; fam families%rowtype; me uuid := auth.uid();
        new_status text; fails int; nm text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select count(*) into fails from audit_logs
    where actor_id = me and action = 'invite.failed' and created_at > now() - interval '10 minutes';
  if fails >= 10 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  select * into inv from family_invitations
    where token_hash = encode(digest(btrim(coalesce(p_token,'')), 'sha256'), 'hex')
      and status = 'active' and expires_at > now() for update;
  if not found then
    insert into audit_logs(actor_id, action) values (me, 'invite.failed');
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if exists (select 1 from family_members where family_id = inv.family_id and user_id = me and status in ('active','pending')) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  select * into fam from families where id = inv.family_id;
  new_status := case when fam.require_approval then 'pending' else 'active' end;

  insert into family_members(family_id, user_id, role, status, joined_at)
    values (inv.family_id, me, 'member', new_status, case when new_status = 'active' then now() end)
    on conflict (family_id, user_id) do update
      set status = excluded.status, role = 'member', joined_at = excluded.joined_at;

  if inv.single_use then
    update family_invitations set status = 'used', used_by = me, used_at = now() where id = inv.id;
  end if;

  select full_name into nm from profiles where id = me;
  insert into notifications(recipient_id, sender_id, type, title, body, payload)
    values (fam.owner_id, me, 'member_joined',
            case when new_status = 'pending' then 'Permintaan bergabung' else 'Anggota baru' end,
            coalesce(nm, 'Seseorang') || case when new_status = 'pending' then ' ingin bergabung ke ' else ' bergabung ke ' end || fam.name,
            jsonb_build_object('family_id', fam.id, 'status', new_status));
  insert into audit_logs(actor_id, action, target_type, target_id) values (me, 'invite.accept', 'family', fam.id);
  return jsonb_build_object('ok', true, 'status', new_status, 'family_id', fam.id);
end $$;

create or replace function public.decide_member(p_member uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m family_members%rowtype; fname text;
begin
  select * into m from family_members where id = p_member for update;
  if not found or not public.is_family_owner(m.family_id) then raise exception 'Tidak diizinkan'; end if;
  if m.status <> 'pending' then raise exception 'Permintaan sudah diproses'; end if;
  update family_members set status = case when p_approve then 'active' else 'removed' end,
         joined_at = case when p_approve then now() end where id = p_member;
  select name into fname from families where id = m.family_id;
  insert into notifications(recipient_id, sender_id, type, title, body, payload)
    values (m.user_id, auth.uid(), case when p_approve then 'join_approved' else 'join_denied' end,
            case when p_approve then 'Permintaan disetujui' else 'Permintaan ditolak' end,
            fname, jsonb_build_object('family_id', m.family_id));
  insert into audit_logs(actor_id, action, target_type, target_id)
    values (auth.uid(), case when p_approve then 'member.approve' else 'member.deny' end, 'family_member', p_member);
end $$;

create or replace function public.remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m family_members%rowtype; fname text;
begin
  select * into m from family_members where id = p_member for update;
  if not found or not public.is_family_owner(m.family_id) then raise exception 'Tidak diizinkan'; end if;
  if m.role = 'owner' then raise exception 'Pemilik tidak bisa dikeluarkan'; end if;
  if m.status <> 'active' then raise exception 'Anggota tidak aktif'; end if;
  update family_members set status = 'removed' where id = p_member;
  update location_shares set is_active = false, stopped_at = now()
    where user_id = m.user_id and family_id = m.family_id and is_active;
  select name into fname from families where id = m.family_id;
  insert into notifications(recipient_id, sender_id, type, title, body, payload)
    values (m.user_id, auth.uid(), 'member_left', 'Dikeluarkan dari grup', fname, jsonb_build_object('family_id', m.family_id));
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'member.remove', 'family_member', p_member);
end $$;

create or replace function public.leave_family(p_family uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m family_members%rowtype; nm text; fam families%rowtype;
begin
  select * into m from family_members where family_id = p_family and user_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'Kamu bukan anggota grup ini'; end if;
  if m.role = 'owner' then raise exception 'Pemilik harus mentransfer kepemilikan sebelum keluar'; end if;
  update family_members set status = 'left' where id = m.id;
  update location_shares set is_active = false, stopped_at = now()
    where user_id = auth.uid() and family_id = p_family and is_active;
  select * into fam from families where id = p_family;
  select full_name into nm from profiles where id = auth.uid();
  insert into notifications(recipient_id, sender_id, type, title, body, payload)
    values (fam.owner_id, auth.uid(), 'member_left', 'Anggota keluar', coalesce(nm,'Seseorang') || ' keluar dari ' || fam.name,
            jsonb_build_object('family_id', p_family));
  insert into audit_logs(actor_id, action, target_type, target_id) values (auth.uid(), 'member.leave', 'family', p_family);
end $$;

create or replace function public.transfer_ownership(p_family uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_family_owner(p_family) then raise exception 'Hanya pemilik yang bisa mentransfer'; end if;
  if p_new_owner = auth.uid() then raise exception 'Pilih anggota lain'; end if;
  if not exists (select 1 from family_members where family_id = p_family and user_id = p_new_owner and status = 'active')
    then raise exception 'Penerima harus anggota aktif'; end if;
  update family_members set role = 'member' where family_id = p_family and user_id = auth.uid();
  update family_members set role = 'owner' where family_id = p_family and user_id = p_new_owner;
  update families set owner_id = p_new_owner where id = p_family;
  insert into audit_logs(actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'family.transfer', 'family', p_family, jsonb_build_object('new_owner', p_new_owner));
end $$;

-- Hanya pengguna login yang boleh memanggil RPC
do $$
declare f text;
begin
  foreach f in array array[
    'create_family(text)','create_invitation(uuid,int,boolean)','revoke_invitation(uuid)',
    'accept_invitation(text)','decide_member(uuid,boolean)','remove_member(uuid)',
    'leave_family(uuid)','transfer_ownership(uuid,uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
