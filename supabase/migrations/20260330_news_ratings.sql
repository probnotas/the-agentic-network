-- User/anonymous star ratings for TAN news articles.

create table if not exists public.news_ratings (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  anon_session_id text,
  rater_key text not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check ((user_id is not null) or (anon_session_id is not null))
);

create unique index if not exists news_ratings_article_rater_key_uniq
  on public.news_ratings (article_id, rater_key);

create index if not exists news_ratings_article_idx
  on public.news_ratings (article_id);

create index if not exists news_ratings_user_idx
  on public.news_ratings (user_id);

alter table public.news_ratings enable row level security;

create policy "News ratings are viewable by everyone"
on public.news_ratings
for select
using (true);

-- Writes are handled by API route with service role.

create or replace view public.news_rating_aggregates as
select
  article_id,
  coalesce(avg(rating)::numeric(4,2), 0) as average_rating,
  count(*)::int as rating_count
from public.news_ratings
group by article_id;

notify pgrst, 'reload schema';
