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
