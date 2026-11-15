-- ============================================================
-- SubShare — Migration 0005: Platform connections + import inbox (Phase 2)
-- Run in Supabase Dashboard -> SQL Editor, AFTER 0001–0004.
--
-- platform_connections: OAuth connections (YouTube / GitHub). Tokens are
--   AES-GCM encrypted by the Edge Functions. The table has NO client
--   policies — browsers can never read or write it; the UI gets a
--   sanitized view through the security-definer RPC list_my_connections().
-- platform_imports: the "import inbox". Sync Edge Functions (service role)
--   fill it; users can see / update / delete their OWN rows only, and there
--   is no insert policy — clients cannot forge imports.
-- Connecting a platform writes a 'platform_connected' activity via trigger.
-- ============================================================

-- ============ platform_connections ============
create table if not exists public.platform_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  platform            public.platform not null,
  external_account_id text,          -- e.g. YouTube channel id / GitHub user id
  external_username   text,          -- e.g. channel title / GitHub login
  access_token        text not null, -- AES-GCM encrypted, edge functions only
  refresh_token       text,          -- AES-GCM encrypted
  token_expires_at    timestamptz,
  scopes              text[] not null default '{}',
  status              text not null default 'connected'
                      check (status in ('connected','expired','revoked','error')),
  last_synced_at      timestamptz,
  last_sync_error     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, platform),
  constraint connections_platform_connectable check (platform in ('youtube','github'))
);

create index if not exists idx_connections_user on public.platform_connections (user_id);

drop trigger if exists trg_connections_updated_at on public.platform_connections;
create trigger trg_connections_updated_at
  before update on public.platform_connections
  for each row execute function public.set_updated_at();

-- ============ platform_imports (import inbox) ============
create table if not exists public.platform_imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  platform         public.platform not null,
  external_id      text,
  name             text not null check (char_length(name) between 1 and 120),
  avatar_url       text,
  url              text not null check (char_length(url) <= 500),
  status           text not null default 'pending'
                   check (status in ('pending','imported','dismissed')),
  imported_item_id uuid references public.collection_items (id) on delete set null,
  discovered_at    timestamptz not null default now(),
  unique (user_id, platform, url),
  constraint imports_platform_valid check (platform in ('youtube','github','instagram'))
);

create index if not exists idx_imports_user_platform on public.platform_imports (user_id, platform, discovered_at desc);
create index if not exists idx_imports_pending on public.platform_imports (user_id) where status = 'pending';

-- ============ RLS ============
-- platform_connections: NO policies at all. Clients get "0 rows"; the
-- service role (Edge Functions) bypasses RLS. Secrets never reach browsers.
alter table public.platform_connections enable row level security;

-- platform_imports: own rows only, and no insert path for clients.
alter table public.platform_imports enable row level security;

drop policy if exists "imports: select own" on public.platform_imports;
create policy "imports: select own" on public.platform_imports
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "imports: update own" on public.platform_imports;
create policy "imports: update own" on public.platform_imports
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "imports: delete own" on public.platform_imports;
create policy "imports: delete own" on public.platform_imports
  for delete to authenticated using (user_id = auth.uid());

-- ============ Connecting writes a feed activity ============
create or replace function public.handle_platform_connected()
returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.activities (actor_id, type, metadata)
  values (new.user_id, 'platform_connected', jsonb_build_object('platform', new.platform));
  return null;
end;
$$;

drop trigger if exists trg_platform_connected on public.platform_connections;
create trigger trg_platform_connected
  after insert on public.platform_connections
  for each row execute function public.handle_platform_connected();

-- ============ Privacy-safe RPCs ============

-- Sanitized connections list for the UI (no token columns, ever).
create or replace function public.list_my_connections()
returns table (
  id                  uuid,
  platform            public.platform,
  status              text,
  external_account_id text,
  external_username   text,
  last_synced_at      timestamptz,
  last_sync_error     text,
  created_at          timestamptz
)
language sql stable security definer set search_path = public, private as $$
  select id, platform, status, external_account_id, external_username,
         last_synced_at, last_sync_error, created_at
  from public.platform_connections
  where user_id = auth.uid();
$$;

-- Disconnect = delete the connection (tokens go with it). Imports are kept.
create or replace function public.disconnect_platform(p_platform public.platform)
returns void
language plpgsql security definer set search_path = public, private as $$
begin
  delete from public.platform_connections
  where user_id = auth.uid() and platform = p_platform;
end;
$$;
