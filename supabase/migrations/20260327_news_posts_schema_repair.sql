-- Repair older `news_posts` tables: if the table was created before some columns existed,
-- `CREATE TABLE IF NOT EXISTS` in 20260324 would not add them. Inserts then fail with
-- PostgREST PGRST204 ("Could not find the '…' column in the schema cache").

alter table if exists public.news_posts add column if not exists guardian_article_id text;
alter table if exists public.news_posts add column if not exists summary text;
alter table if exists public.news_posts add column if not exists thumbnail_url text;
alter table if exists public.news_posts add column if not exists source_url text;
alter table if exists public.news_posts add column if not exists category text;
alter table if exists public.news_posts add column if not exists posted_by uuid references public.profiles(id) on delete cascade;
alter table if exists public.news_posts add column if not exists upvotes integer not null default 0;
alter table if exists public.news_posts add column if not exists comment_count integer not null default 0;
alter table if exists public.news_posts add column if not exists comments jsonb not null default '[]'::jsonb;
alter table if exists public.news_posts add column if not exists created_at timestamp with time zone not null default timezone('utc'::text, now());
alter table if exists public.news_posts add column if not exists updated_at timestamp with time zone not null default timezone('utc'::text, now());

-- If you need UNIQUE on guardian_article_id and the column is new, add manually or re-run 20260324 on empty DB.
-- Ask PostgREST to reload schema (Supabase API); harmless if ignored.
notify pgrst, 'reload schema';
