-- ============================================================
-- SubShare — Migration 0006: fix RLS policy recursion
--
-- Problem: some policies queried their own table (or a table whose
-- policy queried them back), e.g. "follows: select" had
-- `exists (select 1 from public.follows f2 ...)`. Postgres refuses
-- this at runtime with 42P17 "infinite recursion detected in policy
-- for relation follows" — every REST query touching follows (and
-- every policy that referenced follows) failed with HTTP 500.
--
-- Fix: move those sub-checks into SECURITY DEFINER helper functions
-- in schema `private` (not exposed by PostgREST). Definer functions
-- run as their owner and bypass RLS, so a policy may call them
-- without re-entering the same policy — the standard Supabase
-- workaround for recursive policies.
--
-- Affected policies:
--   follows: select            (self-reference to follows)
--   activities: select         (referenced follows + collections + shares)
--   collections: select        (referenced collection_shares, whose own
--                               policy referenced collections — a cycle)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helpers (SECURITY DEFINER so policies can call them safely)
-- ------------------------------------------------------------
create or replace function private.viewer_follows(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = p_viewer
      and f.following_id = p_target
      and f.status = 'accepted'
  );
$$;

create or replace function private.is_shared_with(p_collection_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collection_shares s
    where s.collection_id = p_collection_id
      and s.user_id = p_user
  );
$$;

create or replace function private.can_view_collection(p_collection_id uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collections c
    where c.id = p_collection_id
      and (
        c.owner_id = p_viewer
        or c.visibility = 'public'
        or (
          c.visibility = 'selected'
          and exists (
            select 1 from public.collection_shares s
            where s.collection_id = c.id and s.user_id = p_viewer
          )
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- 2. follows: select — no more self-reference
-- ------------------------------------------------------------
drop policy if exists "follows: select" on public.follows;
create policy "follows: select" on public.follows
  for select to authenticated using (
    follower_id = auth.uid()
    or following_id = auth.uid()
    or (
      status = 'accepted'
      and exists (
        select 1 from public.profiles p
        where p.id = following_id
          and (
            p.is_private = false
            or private.viewer_follows(auth.uid(), p.id)
          )
      )
    )
  );

-- ------------------------------------------------------------
-- 3. collections: select — shares check via helper (breaks the
--    collections <-> collection_shares policy cycle)
-- ------------------------------------------------------------
drop policy if exists "collections: select (visible)" on public.collections;
create policy "collections: select (visible)" on public.collections
  for select to authenticated using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (
      visibility = 'selected'
      and private.is_shared_with(id, auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 4. activities: select — all table references via helpers
-- ------------------------------------------------------------
drop policy if exists "activities: select (visible)" on public.activities;
create policy "activities: select (visible)" on public.activities
  for select to authenticated using (
    actor_id = auth.uid()
    or (
      exists (
        select 1 from public.profiles p
        where p.id = actor_id
          and (
            p.is_private = false
            or private.viewer_follows(auth.uid(), p.id)
          )
      )
      and (
        collection_id is null
        or private.can_view_collection(collection_id, auth.uid())
      )
    )
  );

-- ------------------------------------------------------------
-- 5. Self-heal SQL-created auth users (they can never log in with
--    NULL instance_id / NULL token fields — GoTrue scans them).
--    Idempotent: rows that GoTrue created itself already match.
-- ------------------------------------------------------------
update auth.users
   set instance_id = '00000000-0000-0000-0000-000000000000'
 where instance_id is null;

update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
 where confirmation_token is null or recovery_token is null or email_change is null
    or email_change_token_new is null or email_change_token_current is null
    or phone_change_token is null or reauthentication_token is null;
