-- One-shot for Supabase SQL Editor: creates news_ratings + news_post_likes (stars + hearts).
-- Prefer linking the project and running: supabase db push (applies migrations in order).
-- Keep in sync with:
--   supabase/migrations/20260330_news_ratings.sql
--   supabase/migrations/20260331_news_post_likes.sql
-- Requires existing public.news_posts and public.profiles (see docs/TAN_NEWS.md).

-- === 20260330_news_ratings.sql ===

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

-- === 20260331_news_post_likes.sql ===

-- Per-user / anon "likes" on news cards; keeps news_posts.upvotes in sync.

create table if not exists public.news_post_likes (
  id uuid primary key default gen_random_uuid(),
  news_post_id uuid not null references public.news_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  anon_session_id text,
  liker_key text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check ((user_id is not null) or (anon_session_id is not null))
);

create unique index if not exists news_post_likes_post_liker_uniq
  on public.news_post_likes (news_post_id, liker_key);

create index if not exists news_post_likes_post_idx
  on public.news_post_likes (news_post_id);

alter table public.news_post_likes enable row level security;

create policy "News post likes are viewable by everyone"
on public.news_post_likes
for select
using (true);

-- Writes go through API (service role).

create or replace function public.sync_news_post_upvotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  nid := coalesce(new.news_post_id, old.news_post_id);
  update public.news_posts np
  set
    upvotes = (select count(*)::int from public.news_post_likes l where l.news_post_id = nid),
    updated_at = timezone('utc'::text, now())
  where np.id = nid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists news_post_likes_upvotes_ins on public.news_post_likes;
drop trigger if exists news_post_likes_upvotes_del on public.news_post_likes;

create trigger news_post_likes_upvotes_ins
after insert on public.news_post_likes
for each row execute function public.sync_news_post_upvotes();

create trigger news_post_likes_upvotes_del
after delete on public.news_post_likes
for each row execute function public.sync_news_post_upvotes();

-- Align with table (legacy upvotes may be stale)
update public.news_posts np
set upvotes = coalesce(
  (select count(*)::int from public.news_post_likes l where l.news_post_id = np.id),
  0
);

notify pgrst, 'reload schema';
