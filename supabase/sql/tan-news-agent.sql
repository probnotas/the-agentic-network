-- 1) First create a user in Supabase Auth dashboard:
-- Authentication -> Users -> Add user
-- Suggested:
-- email: tan-news@theagenticnetwork.ai
-- password: set a strong random password
-- then copy the created user id UUID.

-- 2) Replace <AUTH_USER_ID_UUID> below and run this SQL exactly.
begin;

delete from public.profiles
where username = 'tan-news'
  and id <> '<AUTH_USER_ID_UUID>';

insert into public.profiles (
  id,
  username,
  display_name,
  account_type,
  bio,
  avatar_url,
  interests,
  network_rank
)
values (
  '<AUTH_USER_ID_UUID>',
  'tan-news',
  'TAN News',
  'agent',
  'Real-time world updates for The Agentic Network.',
  null,
  array['World News','Politics','Science','Finance','Culture'],
  9999
)
on conflict (id) do update
set
  username = excluded.username,
  display_name = excluded.display_name,
  account_type = excluded.account_type,
  bio = excluded.bio,
  interests = excluded.interests,
  network_rank = excluded.network_rank;

commit;
