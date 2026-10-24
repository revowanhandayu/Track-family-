-- FAMILY TRACKER — Migration 0001: skema inti (Tahap 1)
-- Aman dijalankan ulang (IF NOT EXISTS). RLS diaktifkan di semua tabel;
-- tanpa policy = semua akses ditolak. Policy lengkap dibuat di Tahap 8.

create extension if not exists pgcrypto;

-- ---------- Helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- 1. profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text,
  avatar_url text,
  platform_role text not null default 'user' check (platform_role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 2. families ----------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  photo_url text,
  owner_id uuid not null references public.profiles(id),
  require_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 3. family_members ----------
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  status text not null default 'pending' check (status in ('pending','active','removed','left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);
create unique index if not exists one_owner_per_family
  on public.family_members(family_id) where role = 'owner' and status = 'active';

-- ---------- 4. family_invitations ----------
-- Hanya hash token yang disimpan; token mentah dikirim sekali ke pembuat undangan.
create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invited_by uuid not null references public.profiles(id),
  token_hash text not null unique,
  single_use boolean not null default true,
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','used','revoked','expired')),
  created_at timestamptz not null default now()
);
create index if not exists idx_invitations_family on public.family_invitations(family_id);

-- ---------- 5. registered_devices ----------
create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_uid uuid not null default gen_random_uuid() unique, -- ID acak, tanpa data pribadi
  name text not null check (char_length(name) between 1 and 60),
  platform text,
  browser text,
  app_version text,
  push_subscription_ref text, -- rujukan; kunci push mentah hanya di tabel khusus server
  notifications_enabled boolean not null default false,
  location_permission text not null default 'unknown' check (location_permission in ('unknown','granted','denied','prompt')),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_devices_user on public.registered_devices(user_id);

-- ---------- 6. device_permissions ----------
create table if not exists public.device_permissions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.registered_devices(id) on delete cascade,
  grantee_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('send_notification','send_message','request_location','open_page','revoke_session')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (device_id, grantee_id, permission)
);

-- ---------- 7. location_shares ----------
create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  is_active boolean not null default true,
  duration text not null check (duration in ('15m','1h','8h','manual')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  stopped_at timestamptz,
  allow_history boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_shares_active on public.location_shares(user_id, family_id) where is_active;

-- ---------- 8. current_locations ----------
create table if not exists public.current_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m real check (accuracy_m >= 0),
  device_id uuid references public.registered_devices(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 9. location_history ----------
create table if not exists public.location_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_id uuid references public.location_shares(id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m real,
  recorded_at timestamptz not null default now(),
  purge_after timestamptz not null
);
create index if not exists idx_history_user_time on public.location_history(user_id, recorded_at desc);
create index if not exists idx_history_purge on public.location_history(purge_after);

-- ---------- 10. safety_alerts ----------
create table if not exists public.safety_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  type text not null check (type in ('sos','safe','arrival')),
  status text not null default 'active' check (status in ('active','resolved','cancelled')),
  latitude double precision,
  longitude double precision,
  accuracy_m real,
  message text check (char_length(message) <= 280),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_alerts_family on public.safety_alerts(family_id, created_at desc);

-- ---------- 11. notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in (
    'family_invite','member_joined','member_left','sharing_started','sharing_stopped',
    'device_request','request_approved','request_denied','sos','safe','security')),
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_recipient on public.notifications(recipient_id, created_at desc);

-- ---------- 12. notification_deliveries ----------
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid references public.registered_devices(id) on delete set null,
  channel text not null check (channel in ('in_app','web_push')),
  status text not null default 'pending' check (status in ('pending','sent','delivered','failed')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_deliveries_status on public.notification_deliveries(status);

-- ---------- 13. remote_action_requests ----------
create table if not exists public.remote_action_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  device_id uuid not null references public.registered_devices(id) on delete cascade,
  action text not null check (action in ('send_notification','send_message','request_location','open_page','revoke_session')),
  params jsonb not null default '{}'::jsonb,
  nonce uuid not null default gen_random_uuid() unique, -- cegah replay
  status text not null default 'pending' check (status in ('pending','approved','succeeded','denied','expired','failed')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_remote_device on public.remote_action_requests(device_id, status);

-- ---------- 14. audit_logs ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb, -- jangan isi koordinat/data pribadi
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_actor on public.audit_logs(actor_id, created_at desc);

-- ---------- 15. user_settings ----------
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  history_retention text not null default '24h' check (history_retention in ('24h','7d','30d')),
  stale_after_minutes int not null default 5 check (stale_after_minutes between 1 and 60),
  notify_sos boolean not null default true,
  notify_members boolean not null default true,
  notify_devices boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- 16. user_sessions (ringkasan; sesi asli dikelola Supabase Auth) ----------
create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.registered_devices(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz,
  revoked_at timestamptz
);

-- ---------- Trigger updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','families','family_members','registered_devices','current_locations','user_settings']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Buat profil + setelan otomatis saat registrasi ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, phone)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'Pengguna'), new.phone)
  on conflict (id) do nothing;
  insert into public.user_settings(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Aktifkan RLS di semua tabel (policy: Tahap 8) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','families','family_members','family_invitations','registered_devices',
    'device_permissions','location_shares','current_locations','location_history',
    'safety_alerts','notifications','notification_deliveries','remote_action_requests',
    'audit_logs','user_settings','user_sessions']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
