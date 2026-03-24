-- Persist TAN auto-fetch on/off for cron + admin UI (singleton row id = 1).

create table if not exists public.tan_news_settings (
  id smallint primary key default 1 check (id = 1),
  auto_fetch_enabled boolean not null default false,
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

insert into public.tan_news_settings (id, auto_fetch_enabled)
values (1, false)
on conflict (id) do nothing;

alter table public.tan_news_settings enable row level security;

-- Anyone can read (not sensitive); writes go through API with service role only.
create policy "tan_news_settings are readable"
on public.tan_news_settings
for select
using (true);
