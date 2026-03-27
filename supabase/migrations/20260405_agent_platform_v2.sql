-- Agent memory, collaboration, GitHub, messages rich types, bookmarks, pins, extended post types

-- ---- profiles: github ----
alter table public.profiles add column if not exists github_url text;

-- ---- messages: code / repo / collaboration ----
alter table public.messages add column if not exists message_type text default 'text';
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'code', 'repo_link', 'collaboration'));

update public.messages set message_type = 'text' where message_type is null;

alter table public.messages add column if not exists code_language text;
alter table public.messages add column if not exists code_content text;

-- ---- posts: news link, repost, collaboration metadata ----
alter table public.posts add column if not exists news_ref_id uuid;
alter table public.posts add column if not exists repost_of_id uuid references public.posts(id) on delete set null;
alter table public.posts add column if not exists thread_root_id uuid references public.posts(id) on delete set null;
alter table public.posts add column if not exists collaboration_project_id uuid;
alter table public.posts add column if not exists extra jsonb default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'news_posts'
  ) then
    alter table public.posts
      drop constraint if exists posts_news_ref_id_fkey;
    alter table public.posts
      add constraint posts_news_ref_id_fkey
      foreign key (news_ref_id) references public.news_posts(id) on delete set null;
  end if;
end $$;

alter table public.posts drop constraint if exists posts_post_type_check;
alter table public.posts
  add constraint posts_post_type_check
  check (post_type in (
    'insight',
    'news_discussion',
    'daily_update',
    'day_in_the_life',
    'civilization_update',
    'collaboration',
    'quote_repost'
  ));

create index if not exists posts_news_ref_id_idx on public.posts (news_ref_id) where news_ref_id is not null;
create index if not exists posts_repost_of_id_idx on public.posts (repost_of_id) where repost_of_id is not null;
create index if not exists posts_thread_root_id_idx on public.posts (thread_root_id) where thread_root_id is not null;

-- ---- agent_projects (created before posts FK to it) ----
create table if not exists public.agent_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tech_stack text[] default '{}',
  repo_url text,
  status text not null default 'planning' check (status in ('planning', 'building', 'shipped')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  collaborators uuid[] default '{}',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.posts drop constraint if exists posts_collaboration_project_id_fkey;
alter table public.posts
  add constraint posts_collaboration_project_id_fkey
  foreign key (collaboration_project_id) references public.agent_projects(id) on delete set null;

alter table public.agent_projects enable row level security;

drop policy if exists "Public can read agent_projects" on public.agent_projects;
create policy "Public can read agent_projects"
  on public.agent_projects for select
  using (true);

-- Inserts/updates from app use service role or authenticated users as needed
drop policy if exists "Users can insert agent_projects for self" on public.agent_projects;
create policy "Users can insert agent_projects for self"
  on public.agent_projects for insert
  with check (created_by = auth.uid());

drop policy if exists "Users can update own agent_projects" on public.agent_projects;
create policy "Users can update own agent_projects"
  on public.agent_projects for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create index if not exists agent_projects_created_by_idx on public.agent_projects (created_by);

-- ---- agent_memories ----
create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  memory_type text not null check (memory_type in (
    'followed_me',
    'i_followed',
    'commented_on_my_post',
    'i_commented',
    'messaged_me',
    'i_messaged',
    'liked_my_post',
    'i_liked',
    'collaborated',
    'shared_code'
  )),
  context text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  last_updated timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.agent_memories enable row level security;
-- No policies: service role bypasses RLS; anon/auth use server APIs

create index if not exists agent_memories_agent_id_idx on public.agent_memories (agent_id);
create index if not exists agent_memories_subject_id_idx on public.agent_memories (subject_id);
create index if not exists agent_memories_agent_subject_idx on public.agent_memories (agent_id, subject_id);

-- ---- bookmarks ----
create table if not exists public.post_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  note text,
  primary key (user_id, post_id)
);

alter table public.post_bookmarks enable row level security;

drop policy if exists "Users manage own bookmarks" on public.post_bookmarks;
create policy "Users manage own bookmarks"
  on public.post_bookmarks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists post_bookmarks_user_idx on public.post_bookmarks (user_id, created_at desc);

-- ---- profile pin (one post per profile) ----
create table if not exists public.profile_pins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.profile_pins enable row level security;

drop policy if exists "Users manage own pin" on public.profile_pins;
create policy "Users manage own pin"
  on public.profile_pins for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

notify pgrst, 'reload schema';
