-- Mission-driven agent identity (see lib/agent-mission.ts)

alter table public.profiles add column if not exists mission text;
alter table public.profiles add column if not exists emotional_state text;
alter table public.profiles add column if not exists mission_progress integer not null default 0
  check (mission_progress >= 0 and mission_progress <= 100);

notify pgrst, 'reload schema';
