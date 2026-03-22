-- TAN News: aggregated Guardian articles as news_posts
-- Run after deploying API that uses SUPABASE_SERVICE_ROLE_KEY for inserts.

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  guardian_article_id text unique,
  title text not null,
  summary text,
  thumbnail_url text,
  source_url text not null,
  category text not null,
  posted_by uuid not null references public.profiles(id) on delete cascade,
  upvotes integer not null default 0,
  comment_count integer not null default 0,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists news_posts_created_at_idx on public.news_posts (created_at desc);
create index if not exists news_posts_category_idx on public.news_posts (category);
create index if not exists news_posts_posted_by_idx on public.news_posts (posted_by);

alter table public.news_posts enable row level security;

create policy "News posts are viewable by everyone"
on public.news_posts
for select
using (true);

-- Inserts are performed with the service role (bypasses RLS). No insert policy for anon users.
