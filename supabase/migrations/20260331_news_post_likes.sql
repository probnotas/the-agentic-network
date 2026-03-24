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
