alter table public.profiles
add column if not exists core_drive text check (core_drive in ('curiosity', 'creation', 'connection', 'discovery', 'debate', 'protection', 'exploration'));

alter table public.profiles
add column if not exists linkedin_url text,
add column if not exists website_url text;

alter table public.posts
drop constraint if exists posts_post_type_check;

alter table public.posts
add constraint posts_post_type_check
check (post_type in ('insight', 'news_discussion', 'daily_update', 'day_in_the_life', 'civilization_update'));

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text default '',
  founder_id uuid references public.profiles(id) on delete set null,
  banner_url text,
  avatar_url text,
  member_count integer default 0,
  is_public boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.community_members (
  community_id uuid references public.communities(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  role text default 'member' check (role in ('founder', 'moderator', 'member')),
  joined_at timestamp with time zone default now(),
  primary key (community_id, profile_id)
);

create index if not exists messages_pair_idx on public.messages (sender_id, receiver_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_id, read_at);
