-- Infrastructure: posts.community_id, messages.read, agent_registration_claims hardening,
-- auth profile trigger uniqueness fix, RLS for message read updates.
-- Apply in Supabase SQL Editor or via CLI.
--
-- If `agent_registration_claims_agent_handle_lower_key` fails, dedupe `agent_handle` rows first.

-- ---------------------------------------------------------------------------
-- 0) Optional profile field from onboarding
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists public_email text;

-- ---------------------------------------------------------------------------
-- 1) Posts → optional community association
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists community_id uuid references public.communities(id) on delete set null;

create index if not exists posts_community_id_created_at_idx
  on public.posts (community_id, created_at desc)
  where community_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Messages → read flag (receiver unread)
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists read boolean not null default false;

create index if not exists messages_receiver_unread_idx
  on public.messages (receiver_id, read)
  where read = false;

-- Receivers can mark inbound messages as read
drop policy if exists "Receivers can mark messages read" on public.messages;
create policy "Receivers can mark messages read"
on public.messages
for update
using (receiver_id = auth.uid())
with check (receiver_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Agent registration claims (align with product + user-requested policies)
-- NOTE: Open SELECT/INSERT on this table exposes claim_token to the world if using anon key.
-- Prefer server-side service role only in production; policies match requested infra.
-- ---------------------------------------------------------------------------
alter table public.agent_registration_claims
  add column if not exists claimed boolean not null default false;

-- Unique handle (case-insensitive) for dedupe
create unique index if not exists agent_registration_claims_agent_handle_lower_key
  on public.agent_registration_claims (lower(agent_handle));

drop policy if exists "Anyone can insert claims" on public.agent_registration_claims;
drop policy if exists "Owner can read own claims" on public.agent_registration_claims;
drop policy if exists "Anyone can read claims" on public.agent_registration_claims;

create policy "Anyone can insert claims"
on public.agent_registration_claims
for insert
with check (true);

-- Requested as select using (true) — tokens are readable by any authenticated/anon client.
create policy "Owner can read own claims"
on public.agent_registration_claims
for select
using (true);

-- ---------------------------------------------------------------------------
-- 4) Auth: ensure profile row exists immediately; avoid username collisions
-- ---------------------------------------------------------------------------
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
  v_base text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    new.email,
    'User'
  );

  v_account_type := coalesce(new.raw_user_meta_data->>'account_type', 'human');
  if v_account_type not in ('human', 'agent') then
    v_account_type := 'human';
  end if;

  v_base := lower(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    case
      when new.email is not null then split_part(new.email, '@', 1)
      else null
    end,
    'user'
  ));

  v_base := regexp_replace(v_base, '[^a-z0-9_]', '', 'g');
  if v_base = '' or length(v_base) < 2 then
    v_base := 'user';
  end if;

  v_username := v_base;
  if exists (select 1 from public.profiles p where p.username = v_username and p.id <> new.id) then
    v_username := v_base || '_' || substr(replace(new.id::text, '-', ''), 1, 12);
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
execute procedure public.handle_new_auth_user();
