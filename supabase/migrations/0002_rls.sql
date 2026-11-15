-- ============================================================
-- SubShare — Migration 0002: Row Level Security
-- RLS is enabled on EVERY table. Private data must never leak.
-- Storage: "avatars" bucket with per-user folder policies.
-- Realtime: activities / notifications / follows added to publication.
-- ============================================================

alter table public.profiles               enable row level security;
alter table public.follows                enable row level security;
alter table public.collections            enable row level security;
alter table public.collection_shares      enable row level security;
alter table public.collection_items       enable row level security;
alter table public.collection_followers   enable row level security;
alter table public.activities             enable row level security;
alter table public.notifications          enable row level security;
alter table public.notification_settings  enable row level security;

-- ============================================================
-- profiles
-- Existence/metadata is readable (needed for search + follow requests);
-- "private" hides the account's *content*, not the profile row itself.
-- ============================================================
drop policy if exists "profiles: select (authenticated)" on public.profiles;
create policy "profiles: select (authenticated)" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- follows
-- Read: your own rows always; accepted rows of a profile are visible if that
-- profile is public, or if you are an accepted follower of it (private
-- accounts' follower/following lists stay hidden from strangers).
-- ============================================================
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
            or exists (
              select 1 from public.follows f2
              where f2.follower_id = auth.uid()
                and f2.following_id = p.id
                and f2.status = 'accepted'
            )
          )
      )
    )
  );

-- Insert: only as yourself, never self-follow. Status is decided by the
-- target's privacy: private -> 'pending' (a follow request), public -> 'accepted'.
drop policy if exists "follows: insert" on public.follows;
create policy "follows: insert" on public.follows
  for insert to authenticated with check (
    follower_id = auth.uid()
    and following_id <> auth.uid()
    and status = case
      when coalesce((select p.is_private from public.profiles p where p.id = following_id), true)
        then 'pending'::public.follow_status
      else 'accepted'::public.follow_status
    end
  );

-- Update: only the *receiving* user can accept a pending request.
drop policy if exists "follows: update (accept)" on public.follows;
create policy "follows: update (accept)" on public.follows
  for update to authenticated
  using (following_id = auth.uid())
  with check (following_id = auth.uid() and status = 'accepted');

-- Delete: follower unfollows / cancels own request; target declines a pending request.
drop policy if exists "follows: delete" on public.follows;
create policy "follows: delete" on public.follows
  for delete to authenticated using (
    follower_id = auth.uid()
    or (following_id = auth.uid() and status = 'pending')
  );

-- Guard: a follow row may never change its endpoints, and an accepted follow
-- can only be removed (deleted), never flipped back to pending.
create or replace function public.guard_follow_update()
returns trigger language plpgsql as $$
begin
  if new.follower_id is distinct from old.follower_id
     or new.following_id is distinct from old.following_id then
    raise exception 'follows: endpoints are immutable';
  end if;
  if old.status = 'accepted' and new.status <> 'accepted' then
    raise exception 'follows: accepted follows cannot be modified, unfollow instead';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_follows_guard on public.follows;
create trigger trg_follows_guard
  before update on public.follows
  for each row execute function public.guard_follow_update();

-- ============================================================
-- collections — visibility: public / private / selected
-- ============================================================
drop policy if exists "collections: select (visible)" on public.collections;
create policy "collections: select (visible)" on public.collections
  for select to authenticated using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (
      visibility = 'selected'
      and exists (
        select 1 from public.collection_shares s
        where s.collection_id = id and s.user_id = auth.uid()
      )
    )
  );

drop policy if exists "collections: insert own" on public.collections;
create policy "collections: insert own" on public.collections
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "collections: update own" on public.collections;
create policy "collections: update own" on public.collections
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "collections: delete own" on public.collections;
create policy "collections: delete own" on public.collections
  for delete to authenticated using (owner_id = auth.uid());

-- ============================================================
-- collection_shares — owner manages, shared user can see their row
-- ============================================================
drop policy if exists "shares: select" on public.collection_shares;
create policy "shares: select" on public.collection_shares
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "shares: insert (owner)" on public.collection_shares;
create policy "shares: insert (owner)" on public.collection_shares
  for insert to authenticated with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "shares: delete (owner or self)" on public.collection_shares;
create policy "shares: delete (owner or self)" on public.collection_shares
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

-- ============================================================
-- collection_items — inherit the parent collection's visibility;
-- only the collection owner can write.
-- ============================================================
drop policy if exists "items: select (visible parent)" on public.collection_items;
create policy "items: select (visible parent)" on public.collection_items
  for select to authenticated using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id
        and (
          c.owner_id = auth.uid()
          or c.visibility = 'public'
          or (
            c.visibility = 'selected'
            and exists (
              select 1 from public.collection_shares s
              where s.collection_id = c.id and s.user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "items: insert (parent owner)" on public.collection_items;
create policy "items: insert (parent owner)" on public.collection_items
  for insert to authenticated with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "items: update (parent owner)" on public.collection_items;
create policy "items: update (parent owner)" on public.collection_items
  for update to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));

drop policy if exists "items: delete (parent owner)" on public.collection_items;
create policy "items: delete (parent owner)" on public.collection_items
  for delete to authenticated using (
    exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid())
  );

-- ============================================================
-- collection_followers — you can follow visible collections you don't own
-- ============================================================
drop policy if exists "cfollowers: select" on public.collection_followers;
create policy "cfollowers: select" on public.collection_followers
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "cfollowers: insert (self, visible, not own)" on public.collection_followers;
create policy "cfollowers: insert (self, visible, not own)" on public.collection_followers
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.collections c
      where c.id = collection_id
        and c.owner_id <> auth.uid()
        and (
          c.visibility = 'public'
          or (
            c.visibility = 'selected'
            and exists (
              select 1 from public.collection_shares s
              where s.collection_id = c.id and s.user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "cfollowers: delete (self or owner)" on public.collection_followers;
create policy "cfollowers: delete (self or owner)" on public.collection_followers
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = auth.uid()
    )
  );

-- ============================================================
-- activities
-- Visible only if: it's yours, OR the actor is public / followed by you,
-- AND (if the activity points to a collection) that collection is visible
-- to you. Private collection activity NEVER leaks to strangers.
-- Written only by triggers (definer); clients may not insert/update/delete
-- their way around this (insert policy is locked to own actor for safety).
-- ============================================================
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
            or exists (
              select 1 from public.follows f
              where f.follower_id = auth.uid()
                and f.following_id = p.id
                and f.status = 'accepted'
            )
          )
      )
      and (
        collection_id is null
        or exists (
          select 1 from public.collections c
          where c.id = collection_id
            and (
              c.owner_id = auth.uid()
              or c.visibility = 'public'
              or (
                c.visibility = 'selected'
                and exists (
                  select 1 from public.collection_shares s
                  where s.collection_id = c.id and s.user_id = auth.uid()
                )
              )
            )
        )
      )
    )
  );

drop policy if exists "activities: insert (own actor only)" on public.activities;
create policy "activities: insert (own actor only)" on public.activities
  for insert to authenticated with check (actor_id = auth.uid());

-- No update/delete policies: activities are immutable for clients.

-- ============================================================
-- notifications — strictly own rows; inserts happen via triggers only
-- ============================================================
drop policy if exists "notifications: select own" on public.notifications;
create policy "notifications: select own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications: delete own" on public.notifications;
create policy "notifications: delete own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- notification_settings — own row only
-- ============================================================
drop policy if exists "notif_settings: select own" on public.notification_settings;
create policy "notif_settings: select own" on public.notification_settings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notif_settings: insert own" on public.notification_settings;
create policy "notif_settings: insert own" on public.notification_settings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "notif_settings: update own" on public.notification_settings;
create policy "notif_settings: update own" on public.notification_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Realtime (live feed + live notifications + live request badges)
-- ============================================================
alter table public.notifications replica identity full;
alter table public.activities  replica identity full;
alter table public.follows     replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.activities;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.follows;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ============================================================
-- Storage: avatars bucket (public read, users write only their own folder)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: read" on storage.objects;
create policy "avatars: read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');

drop policy if exists "avatars: insert own folder" on storage.objects;
create policy "avatars: insert own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: update own folder" on storage.objects;
create policy "avatars: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete own folder" on storage.objects;
create policy "avatars: delete own folder" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
