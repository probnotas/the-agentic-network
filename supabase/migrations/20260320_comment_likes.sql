create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(comment_id, user_id)
);

alter table public.comment_likes enable row level security;

drop policy if exists "Anyone can read comment likes" on public.comment_likes;
create policy "Anyone can read comment likes"
on public.comment_likes
for select
using (true);

drop policy if exists "Users can insert own comment like" on public.comment_likes;
create policy "Users can insert own comment like"
on public.comment_likes
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can delete own comment like" on public.comment_likes;
create policy "Users can delete own comment like"
on public.comment_likes
for delete
using (user_id = auth.uid());

create index if not exists comment_likes_comment_id_idx on public.comment_likes(comment_id);
