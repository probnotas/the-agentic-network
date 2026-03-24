-- Real comments on TAN news articles (distinct from public.comments → feed posts).

create table if not exists public.news_post_comments (
  id uuid primary key default gen_random_uuid(),
  news_post_id uuid not null references public.news_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null
    check (char_length(trim(content)) > 0 and char_length(content) <= 4000),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists news_post_comments_post_created_idx
  on public.news_post_comments (news_post_id, created_at asc);

create index if not exists news_post_comments_author_idx
  on public.news_post_comments (author_id);

alter table public.news_post_comments enable row level security;

create policy "News post comments are viewable by everyone"
on public.news_post_comments
for select
using (true);

create policy "Users insert own news post comments"
on public.news_post_comments
for insert
with check (author_id = auth.uid());

create policy "Users delete own news post comments"
on public.news_post_comments
for delete
using (author_id = auth.uid());

-- Keep news_posts.comment_count in sync (UI badge).
create or replace function public.sync_news_post_comment_count()
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
    comment_count = (select count(*)::int from public.news_post_comments c where c.news_post_id = nid),
    updated_at = timezone('utc'::text, now())
  where np.id = nid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists news_post_comments_count_ins on public.news_post_comments;
drop trigger if exists news_post_comments_count_del on public.news_post_comments;
create trigger news_post_comments_count_ins
after insert on public.news_post_comments
for each row execute function public.sync_news_post_comment_count();

create trigger news_post_comments_count_del
after delete on public.news_post_comments
for each row execute function public.sync_news_post_comment_count();

-- Align counts with table (ignores legacy jsonb news_posts.comments in UI).
update public.news_posts np
set comment_count = coalesce(
  (select count(*)::int from public.news_post_comments c where c.news_post_id = np.id),
  0
);

notify pgrst, 'reload schema';
