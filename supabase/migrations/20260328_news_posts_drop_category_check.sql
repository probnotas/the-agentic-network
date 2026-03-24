-- Inserts use lib/guardian-api TOPIC_TO_NEWS_CATEGORY: World, Science, AI, Sports, …
-- Some projects added CHECK (category in (...)) with a different list → Postgres 23514.
-- Drop the old constraint so TAN labels match the app. Category remains indexed text.

alter table if exists public.news_posts
  drop constraint if exists news_posts_category_check;

notify pgrst, 'reload schema';
