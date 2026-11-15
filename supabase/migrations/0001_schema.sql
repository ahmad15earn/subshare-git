-- ============================================================
-- SubShare — Migration 0001: Schema (enums, tables, indexes)
-- Run in Supabase Dashboard -> SQL Editor (as one file, in order).
-- ============================================================

create extension if not exists pg_trgm with schema extensions;

-- ============ Enums ============
do $$ begin
  create type public.platform as enum ('youtube','instagram','github','spotify','x','tiktok','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visibility as enum ('public','private','selected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.follow_status as enum ('pending','accepted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_type as enum ('item_added','collection_created','platform_connected','followed_account');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'new_follower',
    'follow_request',
    'request_accepted',
    'new_collection',
    'new_item_from_followed_user',
    'new_item_in_followed_collection'
  );
exception when duplicate_object then null; end $$;

-- ============ Tables ============

-- Profiles: one row per auth user. "id" mirrors auth.users.id.
-- onboarded=false until the user finished first-run setup (Google users pick a username there).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url   text,
  bio          text check (char_length(bio) <= 280),
  is_private   boolean not null default false,
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Follow graph. Composite PK prevents duplicate follows; check prevents self-follow.
-- status='pending' is used for follow *requests* to private profiles.
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  status       public.follow_status not null default 'accepted',
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

-- Collections of channels/accounts a user shares.
create table if not exists public.collections (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 80),
  description      text check (char_length(description) <= 500),
  visibility       public.visibility not null default 'public',
  activity_enabled boolean not null default true, -- per-collection switch for activity creation
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Extra viewers for collections with visibility='selected'.
create table if not exists public.collection_shares (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, user_id)
);

-- Items inside a collection (a channel/account on some platform).
create table if not exists public.collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  platform      public.platform not null default 'other',
  external_id   text, -- platform-native id (e.g. YouTube channel id), nullable
  name          text not null check (char_length(name) between 1 and 120),
  avatar_url    text,
  url           text not null check (char_length(url) <= 500),
  added_at      timestamptz not null default now(),
  constraint items_unique_url unique (collection_id, url)
);

-- Followers of a collection ("follow a collection" -> get notified about new items).
create table if not exists public.collection_followers (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, user_id)
);

-- Activity stream. Rows are written ONLY by database triggers (see 0003).
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid not null references public.profiles (id) on delete cascade,
  type          public.activity_type not null,
  collection_id uuid references public.collections (id) on delete cascade,
  item_id       uuid references public.collection_items (id) on delete cascade,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Notifications. Rows are written ONLY by database triggers (see 0003).
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null,
  actor_id   uuid references public.profiles (id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Per-user switches for each notification type (default: all on).
create table if not exists public.notification_settings (
  user_id                          uuid primary key references public.profiles (id) on delete cascade,
  new_follower                     boolean not null default true,
  follow_request                   boolean not null default true,
  request_accepted                 boolean not null default true,
  new_collection                   boolean not null default true,
  new_item_from_followed_user      boolean not null default true,
  new_item_in_followed_collection  boolean not null default true
);

-- ============ Indexes ============
create index if not exists idx_follows_following on public.follows (following_id, status);
create index if not exists idx_follows_follower  on public.follows (follower_id, status);
create index if not exists idx_collections_owner on public.collections (owner_id, created_at desc);
create index if not exists idx_shares_user       on public.collection_shares (user_id);
create index if not exists idx_items_collection  on public.collection_items (collection_id, added_at desc);
create index if not exists idx_cfollowers_collection on public.collection_followers (collection_id);
create index if not exists idx_cfollowers_user   on public.collection_followers (user_id);
create index if not exists idx_activities_actor  on public.activities (actor_id, created_at desc);
create index if not exists idx_activities_created on public.activities (created_at desc, id desc);
create index if not exists idx_notifications_user on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (user_id) where is_read = false;

-- Trigram index for fast ILIKE user search.
create index if not exists idx_profiles_search on public.profiles
  using gin ((username || ' ' || display_name) gin_trgm_ops);

-- ============ updated_at maintenance ============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_collections_updated_at on public.collections;
create trigger trg_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();
