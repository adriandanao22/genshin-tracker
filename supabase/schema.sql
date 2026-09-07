-- Orbital Atlas — Supabase schema.
-- Run this once in the Supabase SQL editor for your project.
--
-- Only non-sensitive, user-created data is stored: build plans and the list of
-- priority character ids. Rows are keyed by a pseudonym — HMAC-SHA256 of the
-- HoYoLAB UID (see lib/uid-hash.ts) — so the real UID is never stored, and no
-- credentials (ltoken/ltuid) ever reach the database.

create table if not exists public.user_data (
  uid_hash    text primary key,
  priority    jsonb not null default '[]'::jsonb,
  plans       jsonb not null default '{}'::jsonb,
  active_comp jsonb,
  inventory   jsonb,
  updated_at  timestamptz not null default now()
);

-- If the table already existed, add newer columns:
--   alter table public.user_data add column if not exists active_comp jsonb;
--   alter table public.user_data add column if not exists inventory   jsonb;

-- Defence in depth: enable RLS with NO policies. The browser never talks to
-- Supabase directly; our API routes use the service_role key (which bypasses
-- RLS). With RLS on and no policies, a leaked anon key can read/write nothing.
alter table public.user_data enable row level security;

-- Required environment variables (set in Vercel; keep out of git):
--   SUPABASE_URL                = https://<project-ref>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY   = <service_role secret — NEVER expose to client>
--   HOYOLAB_SESSION_SECRET      = <stable random secret; also derives the UID hash key>
