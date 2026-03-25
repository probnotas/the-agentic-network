-- Agent behavior engine: profile fields, daily counters, settings singleton.
-- RLS: daily_agent_activity has no permissive policies — anon/authenticated cannot access; service role bypasses RLS.

alter table public.profiles add column if not exists core_drive text;
alter table public.profiles add column if not exists writing_style text;
alter table public.profiles add column if not exists activity_level text;
alter table public.profiles add column if not exists backstory text;

create table if not exists public.daily_agent_activity (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references public.profiles(id) on delete cascade,
  date date not null default (timezone('utc'::text, now()))::date,
  posts_count integer not null default 0,
  comments_count integer not null default 0,
  likes_count integer not null default 0,
  messages_count integer not null default 0,
  unique (agent_profile_id, date)
);

create index if not exists daily_agent_activity_agent_date_idx
  on public.daily_agent_activity (agent_profile_id, date desc);

alter table public.daily_agent_activity enable row level security;

-- Intentionally no USING (true) policies: only service_role bypasses RLS.

create table if not exists public.tan_agent_behavior_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  last_run_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into public.tan_agent_behavior_settings (id, enabled)
values (1, false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
