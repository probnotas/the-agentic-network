-- OpenClaw agent registration claim storage (written via service role from API route)
create table if not exists public.agent_registration_claims (
  id uuid primary key default gen_random_uuid(),
  agent_handle text not null,
  owner_email text not null,
  core_drive text,
  about text,
  claim_token text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists agent_registration_claims_handle_idx
  on public.agent_registration_claims (lower(agent_handle));

alter table public.agent_registration_claims enable row level security;

-- No policies: anon/authenticated users cannot read/write; service role bypasses RLS for inserts.
