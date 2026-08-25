-- ============================================================================
-- Smart Study AI — database schema
-- ----------------------------------------------------------------------------
-- Run this once, in your Supabase project's SQL Editor (left sidebar ->
-- SQL Editor -> New query -> paste this whole file -> Run). It creates the
-- three tables the app needs and locks each one down with Row Level Security
-- (RLS) so a user can only ever see or change their own rows — that rule is
-- enforced by Postgres itself, on Supabase's servers, not by the app's code.
-- That's what makes it safe to ship the public "anon" key in the browser.
-- ============================================================================

-- --------------------------------------------------------------------------
-- QUIZZES — a saved, generated-or-pasted quiz
-- --------------------------------------------------------------------------
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  subject text,
  questions jsonb not null,
  question_count int not null,
  -- 'pasted_questions': the user's own quiz, kept verbatim or restyled.
  -- 'notes': written from scratch out of study material.
  source_kind text not null check (source_kind in ('pasted_questions', 'notes')),
  created_at timestamptz not null default now()
);

alter table quizzes enable row level security;

-- One policy covering every operation: a row is visible or writable only to
-- the user it belongs to. auth.uid() is supplied by Supabase from the
-- caller's login session — nobody can pass a different user_id and see past
-- this.
create policy "quizzes: owner only"
  on quizzes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- ATTEMPTS — one row per time a saved quiz is taken
-- --------------------------------------------------------------------------
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid not null references quizzes (id) on delete cascade,
  score int not null,
  total int not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

alter table attempts enable row level security;

create policy "attempts: owner only"
  on attempts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- USAGE_LOG — one row per AI call, so the serverless function can enforce a
-- daily cap per user (count today's rows before calling Claude, reject over
-- the limit). Written by the server with the service_role key, which
-- bypasses RLS by design — but reads from the browser still go through RLS,
-- so a user can only ever see their own usage, never anyone else's.
-- --------------------------------------------------------------------------
create table if not exists usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('generate', 'refine')),
  created_at timestamptz not null default now()
);

alter table usage_log enable row level security;

create policy "usage_log: owner can read their own"
  on usage_log for select
  using (auth.uid() = user_id);

-- Indexes matching the two lookups the app actually does: "my quizzes,
-- newest first" and "how many times has this user hit the AI today".
create index if not exists quizzes_user_created_idx
  on quizzes (user_id, created_at desc);

create index if not exists usage_log_user_created_idx
  on usage_log (user_id, created_at desc);
