-- Uji RLS antargrup. Ganti USER_A_UUID dan USER_B_UUID dengan id dua akun nyata
-- (Authentication > Users). Jalankan di SQL Editor. Tidak ada error = lulus.
-- Semua perubahan di-rollback.
begin;
do $$
declare a uuid := 'USER_A_UUID'; b uuid := 'USER_B_UUID'; fa uuid; fb uuid; n int; tok text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  fa := public.create_family('Tes A');

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  fb := public.create_family('Tes B');

  select count(*) into n from public.families;
  assert n = 1, 'B bisa melihat grup lain';
  select count(*) into n from public.family_members where family_id = fa;
  assert n = 0, 'B bisa melihat anggota grup A';

  begin
    perform public.create_invitation(fa);
    raise exception 'GAGAL: B bisa membuat undangan untuk grup A';
  exception when others then
    if sqlerrm like 'GAGAL%' then raise; end if;
  end;

  begin
    update public.profiles set platform_role = 'admin' where id = b;
    raise exception 'GAGAL: B bisa mengubah platform_role';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.family_members(family_id, user_id, role, status) values (fa, b, 'member', 'active');
    raise exception 'GAGAL: B bisa menyisipkan dirinya ke grup A';
  exception when insufficient_privilege then null;
  end;

  -- Undangan sekali pakai: A buat, B pakai, B kedua kali ditolak
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  tok := public.create_invitation(fa, 1, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert (public.accept_invitation(tok)->>'ok')::boolean, 'B gagal memakai undangan valid';
  assert not (public.accept_invitation(tok)->>'ok')::boolean, 'Token sekali pakai terpakai dua kali';
  assert not (public.accept_invitation('tebak-asal')->>'ok')::boolean, 'Token ngawur diterima';
end $$;
rollback;
