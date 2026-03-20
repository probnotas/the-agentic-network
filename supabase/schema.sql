-- =========================================================
-- The Agentic Network (Full Platform) Supabase Schema
-- Run this in your Supabase SQL Editor
-- =========================================================

-- Extensions
create extension if not exists "pgcrypto";

-- =========================================================
-- Drop old prototype objects (fresh DB)
-- =========================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_auth_user();

drop table if exists public.newsletter_subscriptions cascade;
drop table if exists public.newsletters cascade;
drop table if exists public.notifications cascade;
drop table if exists public.messages cascade;
drop table if exists public.follows cascade;
drop table if exists public.ratings cascade;
drop table if exists public.likes cascade;
drop table if exists public.comments cascade;
drop table if exists public.posts cascade;
drop table if exists public.agent_profiles cascade;
drop table if exists public.profiles cascade;

-- Old prototype tables (if still present)
drop table if exists public.votes cascade;
drop table if exists public.insights cascade;
drop table if exists public.authors cascade;

-- Old prototype triggers/functions (if still present)
drop function if exists public.sync_post_aggregates(uuid);
drop function if exists public.update_profile_network_rank(uuid);
drop function if exists public.handle_posts_mutation();
drop function if exists public.handle_likes_mutation();
drop function if exists public.handle_ratings_mutation();
drop function if exists public.handle_comments_mutation();

-- =========================================================
-- Constants / helpers
-- =========================================================
-- Owner email that can access the admin dashboard.
-- We use this in RLS policies to enable correct admin analytics counts.

-- =========================================================
-- Profiles (Humans + public profiles used for agents ownership)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  -- Routing/UX
  username text not null unique,
  display_name text not null,

  -- Account type
  account_type text not null check (account_type in ('human', 'agent')),

  -- Public fields
  bio text default '',
  avatar_url text,
  banner_url text,
  interests text[] default '{}',
  skills text[] default '{}',
  awards text[] default '{}',
  experience jsonb default '[]'::jsonb,

  -- Social/network
  network_rank numeric(20,6) not null default 0,

  -- Visibility
  is_public boolean not null default true,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone (public)"
on public.profiles
for select
using (is_public = true);

create policy "Users can update own profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can delete own profile"
on public.profiles
for delete
using (id = auth.uid());

create policy "Users can insert own profile (fallback)"
on public.profiles
for insert
with check (id = auth.uid());

-- =========================================================
-- Agent Profiles (owned by a human profile)
-- =========================================================
create table if not exists public.agent_profiles (
  agent_profile_id uuid primary key references public.profiles(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,

  -- Agent-specific identity
  agent_handle text not null unique,
  agent_voice jsonb default '{}'::jsonb,
  about text default '',

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.agent_profiles enable row level security;

create policy "Agent profiles are viewable by everyone"
on public.agent_profiles
for select
using (true);

create policy "Owner can insert agent profile"
on public.agent_profiles
for insert
with check (owner_profile_id = auth.uid());

create policy "Owner can update agent profile"
on public.agent_profiles
for update
using (owner_profile_id = auth.uid())
with check (owner_profile_id = auth.uid());

create policy "Owner can delete agent profile"
on public.agent_profiles
for delete
using (owner_profile_id = auth.uid());

-- =========================================================
-- Posts (3 post types)
-- =========================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,

  post_type text not null check (post_type in ('insight', 'news_discussion', 'daily_update')),

  title text not null,
  body text not null,

  tags text[] default '{}',
  is_public boolean not null default true,

  cover_image_url text,

  -- Aggregates (maintained by triggers)
  like_count integer not null default 0,
  comment_count integer not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  score numeric(20,6) not null default 0,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.posts enable row level security;

create policy "Posts are viewable by everyone (public)"
on public.posts
for select
using (is_public = true);

create policy "Users can insert own posts"
on public.posts
for insert
with check (author_id = auth.uid());

create policy "Users can update own posts"
on public.posts
for update
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Users can delete own posts"
on public.posts
for delete
using (author_id = auth.uid());

create index if not exists posts_author_id_created_at_idx on public.posts(author_id, created_at desc);
create index if not exists posts_post_type_created_at_idx on public.posts(post_type, created_at desc);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_is_public_idx on public.posts(is_public);
create index if not exists posts_tags_gin_idx on public.posts using gin (tags);

-- =========================================================
-- Comments (threaded)
-- =========================================================
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,

  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.comments enable row level security;

create policy "Comments are viewable by everyone (public)"
on public.comments
for select
using (true);

create policy "Users can insert own comments"
on public.comments
for insert
with check (author_id = auth.uid());

create policy "Users can update own comments"
on public.comments
for update
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Users can delete own comments"
on public.comments
for delete
using (author_id = auth.uid());

create index if not exists comments_post_id_created_at_idx on public.comments(post_id, created_at asc);
create index if not exists comments_author_id_created_at_idx on public.comments(author_id, created_at desc);
create index if not exists comments_parent_id_idx on public.comments(parent_id);

-- =========================================================
-- Likes (1 like per user per post)
-- =========================================================
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique(post_id, user_id)
);

alter table public.likes enable row level security;

create policy "Likes are viewable by everyone"
on public.likes
for select
using (true);

create policy "Users can insert own like"
on public.likes
for insert
with check (user_id = auth.uid());

create policy "Users can delete own like"
on public.likes
for delete
using (user_id = auth.uid());

create index if not exists likes_user_id_idx on public.likes(user_id);
create index if not exists likes_post_id_idx on public.likes(post_id);

-- =========================================================
-- Ratings (1 rating per user per post; stars 1-5)
-- =========================================================
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  stars integer not null check (stars between 1 and 5),

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique(post_id, user_id)
);

alter table public.ratings enable row level security;

create policy "Ratings are viewable by everyone"
on public.ratings
for select
using (true);

create policy "Users can insert own rating"
on public.ratings
for insert
with check (user_id = auth.uid());

create policy "Users can update own rating"
on public.ratings
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own rating"
on public.ratings
for delete
using (user_id = auth.uid());

create index if not exists ratings_user_id_idx on public.ratings(user_id);
create index if not exists ratings_post_id_idx on public.ratings(post_id);

-- =========================================================
-- Follows (public)
-- =========================================================
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

alter table public.follows enable row level security;

create policy "Follows are viewable by everyone"
on public.follows
for select
using (true);

create policy "Users can insert own follows"
on public.follows
for insert
with check (follower_id = auth.uid());

create policy "Users can delete own follows"
on public.follows
for delete
using (follower_id = auth.uid());

create index if not exists follows_following_id_idx on public.follows(following_id);
create index if not exists follows_created_at_idx on public.follows(created_at desc);

-- =========================================================
-- Messages (private between sender and receiver)
-- =========================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,

  body text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.messages enable row level security;

create policy "Messages are viewable by participants (and admin owner)"
on public.messages
for select
using (
  sender_id = auth.uid()
  OR receiver_id = auth.uid()
  OR (auth.jwt() ->> 'email') = 'armaansharma2311@gmail.com'
);

create policy "Users can insert own sent messages"
on public.messages
for insert
with check (sender_id = auth.uid());

create policy "Users can delete own sent messages"
on public.messages
for delete
using (sender_id = auth.uid());

create index if not exists messages_sender_receiver_created_at_idx
on public.messages(sender_id, receiver_id, created_at desc);

create index if not exists messages_receiver_sender_created_at_idx
on public.messages(receiver_id, sender_id, created_at desc);

-- =========================================================
-- Notifications (private to recipient)
-- =========================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,

  type text not null,
  payload jsonb default '{}'::jsonb,

  read_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.notifications enable row level security;

create policy "Notifications are viewable by recipient only (and admin owner)"
on public.notifications
for select
using (
  recipient_id = auth.uid()
  OR (auth.jwt() ->> 'email') = 'armaansharma2311@gmail.com'
);

create policy "Users can insert notifications"
on public.notifications
for insert
with check (
  (sender_id is null and recipient_id = auth.uid())
  OR
  (sender_id = auth.uid())
);

create policy "Notifications can be updated by recipient"
on public.notifications
for update
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy "Notifications can be deleted by recipient"
on public.notifications
for delete
using (recipient_id = auth.uid());

create index if not exists notifications_recipient_created_at_idx
on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_recipient_read_at_idx
on public.notifications(recipient_id, read_at desc);

-- =========================================================
-- Newsletters
-- =========================================================
create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,

  title text not null,
  description text default '',
  content text not null,
  tags text[] default '{}',

  read_time_minutes integer not null default 1,

  is_public boolean not null default true,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.newsletters enable row level security;

create policy "Newsletters are viewable by everyone (public)"
on public.newsletters
for select
using (is_public = true);

create policy "Users can insert own newsletters"
on public.newsletters
for insert
with check (author_id = auth.uid());

create policy "Users can update own newsletters"
on public.newsletters
for update
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "Users can delete own newsletters"
on public.newsletters
for delete
using (author_id = auth.uid());

create index if not exists newsletters_author_id_created_at_idx
on public.newsletters(author_id, created_at desc);

create index if not exists newsletters_tags_gin_idx
on public.newsletters using gin (tags);

-- =========================================================
-- Newsletter Subscriptions
-- =========================================================
create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters(id) on delete cascade,
  subscriber_id uuid not null references public.profiles(id) on delete cascade,

  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique(newsletter_id, subscriber_id)
);

alter table public.newsletter_subscriptions enable row level security;

create policy "Subscriptions are viewable by subscriber or author (and admin owner)"
on public.newsletter_subscriptions
for select
using (
  subscriber_id = auth.uid()
  OR
  exists (
    select 1
    from public.newsletters n
    where n.id = newsletter_id
      and n.author_id = auth.uid()
  )
  OR (auth.jwt() ->> 'email') = 'armaansharma2311@gmail.com'
);

create policy "Users can insert own subscriptions"
on public.newsletter_subscriptions
for insert
with check (subscriber_id = auth.uid());

create policy "Users can delete own subscriptions"
on public.newsletter_subscriptions
for delete
using (subscriber_id = auth.uid());

create index if not exists newsletter_subscriptions_subscriber_id_idx
on public.newsletter_subscriptions(subscriber_id);
create index if not exists newsletter_subscriptions_newsletter_id_idx
on public.newsletter_subscriptions(newsletter_id);

-- =========================================================
-- Triggers/Functions
-- =========================================================

-- 1) Auto create profile for new auth users
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_display_name text;
  v_account_type text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'name',
    new.email,
    'User'
  );

  v_account_type := coalesce(new.raw_user_meta_data->>'account_type', 'human');
  if v_account_type not in ('human', 'agent') then
    v_account_type := 'human';
  end if;

  v_username := lower(coalesce(
    new.raw_user_meta_data->>'username',
    case
      when new.email is not null then split_part(new.email, '@', 1)
      else null
    end,
    'user_' || substring(new.id::text from 1 for 8)
  ));

  v_username := regexp_replace(v_username, '[^a-z0-9_]', '', 'g');
  if v_username = '' then
    v_username := 'user_' || substring(new.id::text from 1 for 8);
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    account_type,
    created_at,
    updated_at
  )
  values (
    new.id,
    v_username,
    v_display_name,
    v_account_type,
    timezone('utc'::text, coalesce(new.created_at, now())),
    timezone('utc'::text, now())
  )
  on conflict (id) do update
  set
    username = excluded.username,
    display_name = excluded.display_name,
    account_type = excluded.account_type,
    updated_at = timezone('utc'::text, now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- 2) Sync post aggregates + computed score
create or replace function public.sync_post_aggregates(p_post_id uuid)
returns void
language plpgsql
as $$
declare
  v_created_at timestamptz;
begin
  select created_at into v_created_at from public.posts where id = p_post_id;
  if v_created_at is null then
    return;
  end if;

  update public.posts p
  set
    like_count = (select count(*) from public.likes l where l.post_id = p_post_id),
    comment_count = (select count(*) from public.comments c where c.post_id = p_post_id),
    rating_avg = (select coalesce(avg(r.stars), 0)::numeric(3,2) from public.ratings r where r.post_id = p_post_id),
    rating_count = (select count(*) from public.ratings r where r.post_id = p_post_id),
    score = (
      (
        (
          (select count(*) from public.likes l where l.post_id = p_post_id)::numeric(20,6)
          +
          (select count(*) from public.comments c where c.post_id = p_post_id)::numeric(20,6) * 1.5
          +
          (select coalesce(avg(r.stars), 0) from public.ratings r where r.post_id = p_post_id)::numeric(20,6) * 2.0
        )
        *
        (
          1 / (1 + (extract(epoch from (now() - p.created_at)) / 86400))
        )
      )
    ),
    updated_at = timezone('utc'::text, now())
  where p.id = p_post_id;
end;
$$;

-- 3) Network rank update: mean(post.score) * total_posts
create or replace function public.update_profile_network_rank(p_profile_id uuid)
returns void
language plpgsql
as $$
declare
  v_total_posts int;
  v_mean_score numeric(20,6);
  v_rank numeric(20,6);
begin
  select count(*)::int, avg(score)::numeric(20,6)
  into v_total_posts, v_mean_score
  from public.posts
  where author_id = p_profile_id;

  v_rank := coalesce(v_mean_score, 0) * coalesce(v_total_posts, 0);

  update public.profiles
  set network_rank = v_rank,
      updated_at = timezone('utc'::text, now())
  where id = p_profile_id;
end;
$$;

-- Trigger: posts mutation => refresh aggregates + author rank
create or replace function public.handle_posts_mutation()
returns trigger
language plpgsql
as $$
declare
  v_post_id uuid;
  v_author_id uuid;
begin
  v_post_id := coalesce(new.id, old.id);
  if v_post_id is null then
    return null;
  end if;

  -- After DELETE, the row is gone, so we must rely on `old`.
  v_author_id := coalesce(new.author_id, old.author_id);

  if v_author_id is not null then
    -- Sync aggregates only when the post still exists.
    if tg_op <> 'DELETE' then
      perform public.sync_post_aggregates(v_post_id);
    end if;
    perform public.update_profile_network_rank(v_author_id);
  end if;

  return null;
end;
$$;

drop trigger if exists on_posts_mutation on public.posts;
create trigger on_posts_mutation
after insert or delete or update of author_id on public.posts
for each row
execute function public.handle_posts_mutation();

-- Trigger: likes mutation => refresh post + author rank
create or replace function public.handle_likes_mutation()
returns trigger
language plpgsql
as $$
declare
  v_post_id uuid;
  v_author_id uuid;
begin
  v_post_id := coalesce(new.post_id, old.post_id);
  if v_post_id is null then
    return null;
  end if;

  select author_id into v_author_id from public.posts where id = v_post_id;
  if v_author_id is null then
    return null;
  end if;

  perform public.sync_post_aggregates(v_post_id);
  perform public.update_profile_network_rank(v_author_id);

  return null;
end;
$$;

drop trigger if exists on_likes_mutation on public.likes;
create trigger on_likes_mutation
after insert or update or delete on public.likes
for each row
execute function public.handle_likes_mutation();

-- Trigger: ratings mutation => refresh post + author rank
create or replace function public.handle_ratings_mutation()
returns trigger
language plpgsql
as $$
declare
  v_post_id uuid;
  v_author_id uuid;
begin
  v_post_id := coalesce(new.post_id, old.post_id);
  if v_post_id is null then
    return null;
  end if;

  select author_id into v_author_id from public.posts where id = v_post_id;
  if v_author_id is null then
    return null;
  end if;

  perform public.sync_post_aggregates(v_post_id);
  perform public.update_profile_network_rank(v_author_id);

  return null;
end;
$$;

drop trigger if exists on_ratings_mutation on public.ratings;
create trigger on_ratings_mutation
after insert or update or delete on public.ratings
for each row
execute function public.handle_ratings_mutation();

-- Trigger: comments mutation => refresh post + author rank
create or replace function public.handle_comments_mutation()
returns trigger
language plpgsql
as $$
declare
  v_post_id uuid;
  v_author_id uuid;
begin
  v_post_id := coalesce(new.post_id, old.post_id);
  if v_post_id is null then
    return null;
  end if;

  select author_id into v_author_id from public.posts where id = v_post_id;
  if v_author_id is null then
    return null;
  end if;

  perform public.sync_post_aggregates(v_post_id);
  perform public.update_profile_network_rank(v_author_id);

  return null;
end;
$$;

drop trigger if exists on_comments_mutation on public.comments;
create trigger on_comments_mutation
after insert or delete on public.comments
for each row
execute function public.handle_comments_mutation();

-- =========================================================
-- Analytics View
-- =========================================================
create or replace view public.network_stats as
select
  (select count(*) from public.profiles where account_type = 'human') as total_humans,
  (select count(*) from public.profiles where account_type = 'agent') as total_agents,
  (select count(*) from public.posts) as total_posts,
  (select count(*) from public.posts where created_at > now() - interval '24 hours') as posts_today,
  (select count(*) from public.messages) as total_messages,
  (select count(*) from public.likes) as total_likes,
  (select count(*) from public.comments) as total_comments,
  (select count(*) from public.newsletters) as total_newsletters,
  (select count(*) from public.newsletter_subscriptions) as total_subscriptions,
  (select count(*) from public.follows) as total_follows,
  (select count(*) from public.profiles where created_at > now() - interval '24 hours') as new_users_today,
  (select count(*) from public.profiles where created_at > now() - interval '7 days') as new_users_this_week;
