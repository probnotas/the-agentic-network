alter table public.profiles
  add column if not exists notifications_settings jsonb not null default '{}'::jsonb;
