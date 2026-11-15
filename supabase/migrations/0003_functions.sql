-- ============================================================
-- SubShare — Migration 0003: Functions, triggers, RPCs
-- - auto-create profile + notification settings on signup
-- - activities & notifications written by triggers only
-- - notification_settings respected
-- - privacy-checked RPCs for feed, search, discover, profile, collections
-- ============================================================

-- ============================================================
-- Private helpers (schema "private" is NOT exposed by PostgREST)
-- ============================================================
create schema if not exists private;

create or replace function private.viewer_follows(p_viewer uuid, p_target uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = p_viewer and f.following_id = p_target and f.status = 'accepted'
  );
$$;

create or replace function private.can_view_collection(p_collection_id uuid, p_viewer uuid)
returns boolean language sql stable as $$
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

-- ============================================================
-- Auto-create profile + notification settings when a user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  base  text;
  uname text;
  n     int := 0;
begin
  base := lower(regexp_replace(
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    '[^a-z0-9_]', '', 'g'
  ));
  if base is null or char_length(base) < 3 then
    base := 'user';
  end if;
  base := left(base, 20);
  uname := base;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url, onboarded)
  values (
    new.id,
    uname,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    -- email signup passes "username" in metadata -> onboarding already done
    new.raw_user_meta_data->>'username' is not null
  )
  on conflict (id) do nothing;

  insert into public.notification_settings (user_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- notify(): insert a notification, respecting the recipient's settings
-- ============================================================
create or replace function public.notify(
  p_user   uuid,
  p_type   public.notification_type,
  p_actor  uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public, private as $$
declare
  allowed boolean;
begin
  if p_user is null or p_actor is null or p_user = p_actor then
    return;
  end if;

  select case p_type
    when 'new_follower'                     then s.new_follower
    when 'follow_request'                   then s.follow_request
    when 'request_accepted'                 then s.request_accepted
    when 'new_collection'                   then s.new_collection
    when 'new_item_from_followed_user'      then s.new_item_from_followed_user
    when 'new_item_in_followed_collection'  then s.new_item_in_followed_collection
  end
  into allowed
  from public.notification_settings s
  where s.user_id = p_user;

  if coalesce(allowed, true) then
    insert into public.notifications (user_id, type, actor_id, payload)
    values (p_user, p_type, p_actor, p_payload);
  end if;
end;
$$;

-- ============================================================
-- Follows -> notifications (new_follower / follow_request / request_accepted)
-- ============================================================
create or replace function public.handle_follow_change()
returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_actor jsonb;
begin
  if tg_op = 'INSERT' then
    select jsonb_build_object('username', p.username, 'display_name', p.display_name)
      into v_actor
    from public.profiles p
    where p.id = new.follower_id;

    if new.status = 'accepted' then
      perform public.notify(new.following_id, 'new_follower', new.follower_id, v_actor);
    else
      perform public.notify(new.following_id, 'follow_request', new.follower_id, v_actor);
    end if;

  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    select jsonb_build_object('username', p.username, 'display_name', p.display_name)
      into v_actor
    from public.profiles p
    where p.id = new.following_id;

    perform public.notify(new.follower_id, 'request_accepted', new.following_id, v_actor);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_follows_notify on public.follows;
create trigger trg_follows_notify
  after insert or update on public.follows
  for each row execute function public.handle_follow_change();

-- ============================================================
-- New collection -> activity + notifications to followers
-- ============================================================
create or replace function public.handle_collection_created()
returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.activity_enabled then
    insert into public.activities (actor_id, type, collection_id, metadata)
    values (new.owner_id, 'collection_created', new.id, jsonb_build_object('title', new.title));

    perform public.notify(
      f.follower_id, 'new_collection', new.owner_id,
      jsonb_build_object('collection_id', new.id, 'title', new.title)
    )
    from public.follows f
    where f.following_id = new.owner_id and f.status = 'accepted';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_collection_created on public.collections;
create trigger trg_collection_created
  after insert on public.collections
  for each row execute function public.handle_collection_created();

-- ============================================================
-- New item -> activity + notifications
-- (owner followers get new_item_from_followed_user; collection followers
--  who are NOT owner followers get new_item_in_followed_collection — no dupes)
-- ============================================================
create or replace function public.handle_item_added()
returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  c public.collections%rowtype;
begin
  select * into c from public.collections where id = new.collection_id;
  if not c.activity_enabled then
    return null;
  end if;

  insert into public.activities (actor_id, type, collection_id, item_id, metadata)
  values (
    c.owner_id, 'item_added', c.id, new.id,
    jsonb_build_object('item_name', new.name, 'platform', new.platform)
  );

  perform public.notify(
    f.follower_id, 'new_item_from_followed_user', c.owner_id,
    jsonb_build_object(
      'collection_id', c.id, 'collection_title', c.title,
      'item_id', new.id, 'item_name', new.name,
      'item_url', new.url, 'platform', new.platform
    )
  )
  from public.follows f
  where f.following_id = c.owner_id and f.status = 'accepted';

  perform public.notify(
    cf.user_id, 'new_item_in_followed_collection', c.owner_id,
    jsonb_build_object(
      'collection_id', c.id, 'collection_title', c.title,
      'item_id', new.id, 'item_name', new.name,
      'item_url', new.url, 'platform', new.platform
    )
  )
  from public.collection_followers cf
  where cf.collection_id = c.id
    and not exists (
      select 1 from public.follows f
      where f.follower_id = cf.user_id
        and f.following_id = c.owner_id
        and f.status = 'accepted'
    );

  return null;
end;
$$;

drop trigger if exists trg_item_added on public.collection_items;
create trigger trg_item_added
  after insert on public.collection_items
  for each row execute function public.handle_item_added();

-- ============================================================
-- RPC: get_feed — activities from accepted-followed users, cursor paginated.
-- Cursor = (created_at, id) of the last row on the previous page.
-- ============================================================
create or replace function public.get_feed(
  p_before    timestamptz default null,
  p_before_id uuid default null,
  p_limit     int default 20
)
returns table (
  id                 uuid,
  actor_id           uuid,
  type               public.activity_type,
  collection_id      uuid,
  item_id            uuid,
  metadata           jsonb,
  created_at         timestamptz,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  collection_title   text,
  item_name          text,
  item_platform      public.platform,
  item_url           text
)
language sql stable security definer set search_path = public, private as $$
  select
    a.id, a.actor_id, a.type, a.collection_id, a.item_id, a.metadata, a.created_at,
    p.username, p.display_name, p.avatar_url,
    c.title, i.name, i.platform, i.url
  from public.activities a
  join public.profiles p on p.id = a.actor_id
  left join public.collections c on c.id = a.collection_id
  left join public.collection_items i on i.id = a.item_id
  where a.actor_id <> auth.uid()
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = a.actor_id and f.status = 'accepted'
    )
    and (p.is_private = false or private.viewer_follows(auth.uid(), a.actor_id))
    and (a.collection_id is null or private.can_view_collection(a.collection_id, auth.uid()))
    and (
      p_before is null
      or (a.created_at, a.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  order by a.created_at desc, a.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ============================================================
-- RPC: get_profile_activities — one profile's visible activities
-- ============================================================
create or replace function public.get_profile_activities(
  p_profile_id uuid,
  p_before     timestamptz default null,
  p_before_id  uuid default null,
  p_limit      int default 20
)
returns table (
  id                 uuid,
  actor_id           uuid,
  type               public.activity_type,
  collection_id      uuid,
  item_id            uuid,
  metadata           jsonb,
  created_at         timestamptz,
  actor_username     text,
  actor_display_name text,
  actor_avatar_url   text,
  collection_title   text,
  item_name          text,
  item_platform      public.platform,
  item_url           text
)
language sql stable security definer set search_path = public, private as $$
  select
    a.id, a.actor_id, a.type, a.collection_id, a.item_id, a.metadata, a.created_at,
    p.username, p.display_name, p.avatar_url,
    c.title, i.name, i.platform, i.url
  from public.activities a
  join public.profiles p on p.id = a.actor_id
  left join public.collections c on c.id = a.collection_id
  left join public.collection_items i on i.id = a.item_id
  where a.actor_id = p_profile_id
    and (
      a.actor_id = auth.uid()
      or p.is_private = false
      or private.viewer_follows(auth.uid(), p_profile_id)
    )
    and (a.collection_id is null or private.can_view_collection(a.collection_id, auth.uid()))
    and (
      p_before is null
      or (a.created_at, a.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  order by a.created_at desc, a.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ============================================================
-- RPC: search_users
-- ============================================================
create or replace function public.search_users(p_q text, p_limit int default 20)
returns table (
  id            uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  bio           text,
  is_private    boolean,
  follow_status public.follow_status,
  follows_me    boolean
)
language sql stable security definer set search_path = public, private as $$
  select
    p.id, p.username, p.display_name, p.avatar_url, p.bio, p.is_private,
    f.status as follow_status,
    exists (
      select 1 from public.follows f2
      where f2.follower_id = p.id and f2.following_id = auth.uid() and f2.status = 'accepted'
    ) as follows_me
  from public.profiles p
  left join public.follows f
    on f.follower_id = auth.uid() and f.following_id = p.id
  where p.id <> auth.uid()
    and p_q is not null and p_q <> ''
    and (p.username ilike '%' || p_q || '%' or p.display_name ilike '%' || p_q || '%')
  order by
    case
      when p.username = lower(p_q) then 0
      when p.username ilike p_q || '%' then 1
      else 2
    end,
    p.username
  limit least(greatest(p_limit, 1), 30);
$$;

-- ============================================================
-- RPC: search_collections (visible collections only)
-- ============================================================
create or replace function public.search_collections(p_q text, p_limit int default 20)
returns table (
  id                 uuid,
  owner_id           uuid,
  title              text,
  description        text,
  visibility         public.visibility,
  created_at         timestamptz,
  owner_username     text,
  owner_display_name text,
  owner_avatar_url   text,
  item_count         int,
  is_following       boolean
)
language sql stable security definer set search_path = public, private as $$
  select
    c.id, c.owner_id, c.title, c.description, c.visibility, c.created_at,
    p.username, p.display_name, p.avatar_url,
    (select count(*) from public.collection_items i where i.collection_id = c.id)::int as item_count,
    exists (
      select 1 from public.collection_followers cf
      where cf.collection_id = c.id and cf.user_id = auth.uid()
    ) as is_following
  from public.collections c
  join public.profiles p on p.id = c.owner_id
  where private.can_view_collection(c.id, auth.uid())
    and p_q is not null and p_q <> ''
    and (c.title ilike '%' || p_q || '%' or coalesce(c.description, '') ilike '%' || p_q || '%')
  order by item_count desc, c.created_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

-- ============================================================
-- RPC: get_popular_items — most-shared items across PUBLIC collections
-- ============================================================
create or replace function public.get_popular_items(p_limit int default 10)
returns table (
  platform             public.platform,
  external_id          text,
  name                 text,
  avatar_url           text,
  url                  text,
  shared_count         int,
  sample_collection_id uuid
)
language sql stable security definer set search_path = public, private as $$
  select
    pub.platform,
    min(pub.external_id) as external_id,
    (array_agg(pub.name order by pub.added_at))[1] as name,
    min(pub.avatar_url) as avatar_url,
    (array_agg(pub.url order by pub.added_at))[1] as url,
    count(distinct pub.owner_id)::int as shared_count,
    (array_agg(pub.collection_id order by pub.added_at))[1] as sample_collection_id
  from (
    select i.platform, i.external_id, i.name, i.avatar_url, i.url, i.collection_id, i.added_at, c.owner_id
    from public.collection_items i
    join public.collections c on c.id = i.collection_id
    where c.visibility = 'public'
  ) as pub
  group by pub.platform, lower(pub.name)
  order by shared_count desc, name asc
  limit least(greatest(p_limit, 1), 20);
$$;

-- ============================================================
-- RPC: get_suggested_people — mutual follows / shared followings /
-- overlapping public items; falls back to newest public users.
-- ============================================================
create or replace function public.get_suggested_people(p_limit int default 10)
returns table (
  id            uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  bio           text,
  is_private    boolean,
  reason        text,
  follows_me    boolean
)
language sql stable security definer set search_path = public, private as $$
  with me as (select auth.uid() as uid),
  my_following as (
    select f.following_id from public.follows f, me
    where f.follower_id = me.uid and f.status = 'accepted'
  ),
  my_followers as (
    select f.follower_id from public.follows f, me
    where f.following_id = me.uid and f.status = 'accepted'
  ),
  candidates as (
    select
      p.id, p.username, p.display_name, p.avatar_url, p.bio, p.is_private, p.created_at,
      exists (
        select 1 from public.follows f, me
        where f.follower_id = p.id and f.following_id = me.uid and f.status = 'accepted'
      ) as follows_me,
      (
        select count(*) from public.follows f
        where f.following_id = p.id and f.status = 'accepted'
          and f.follower_id in (select follower_id from my_followers)
      )::int as mutual_cnt,
      (
        select count(*) from public.follows f
        where f.follower_id = p.id and f.status = 'accepted'
          and f.following_id in (select following_id from my_following)
      )::int as shared_cnt,
      (
        select count(*) from public.collection_items i1
        join public.collections c1 on c1.id = i1.collection_id
          and c1.owner_id = p.id and c1.visibility = 'public'
        join public.collection_items i2 on i2.platform = i1.platform and lower(i2.name) = lower(i1.name)
        join public.collections c2 on c2.id = i2.collection_id
          and c2.owner_id = (select uid from me) and c2.visibility = 'public'
      )::int as overlap_cnt
    from public.profiles p, me
    where p.id <> me.uid
      and not exists (
        select 1 from public.follows f
        where f.follower_id = me.uid and f.following_id = p.id
      )
      and (
        p.is_private = false
        or exists (
          select 1 from public.follows f
          where f.follower_id = p.id and f.following_id = me.uid and f.status = 'accepted'
        )
      )
  )
  select
    id, username, display_name, avatar_url, bio, is_private,
    case
      when follows_me then 'Follows you'
      when mutual_cnt > 0 then mutual_cnt::text || ' mutual ' || (case when mutual_cnt = 1 then 'follower' else 'followers' end)
      when shared_cnt > 0 then shared_cnt::text || ' shared following' || (case when shared_cnt = 1 then '' else 's' end)
      when overlap_cnt > 0 then 'Similar interests'
      else 'New on SubShare'
    end as reason,
    follows_me
  from candidates
  order by
    (mutual_cnt * 2 + shared_cnt + overlap_cnt * 2 + (case when follows_me then 3 else 0 end)) desc,
    created_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

-- ============================================================
-- RPC: get_profile_counts — numbers only (lists stay privacy-gated)
-- ============================================================
create or replace function public.get_profile_counts(p_profile_id uuid)
returns table (
  followers     int,
  following     int,
  collections   int,
  is_private    boolean,
  follow_status public.follow_status
)
language sql stable security definer set search_path = public, private as $$
  select
    (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted')::int,
    (select count(*) from public.follows f where f.follower_id = p.id and f.status = 'accepted')::int,
    (select count(*) from public.collections c
      where c.owner_id = p.id and private.can_view_collection(c.id, auth.uid()))::int,
    p.is_private,
    (select f.status from public.follows f where f.follower_id = auth.uid() and f.following_id = p.id)
  from public.profiles p
  where p.id = p_profile_id;
$$;

-- ============================================================
-- RPC: get_collection — one collection with owner info + viewer state
-- Returns an empty result if the viewer is not allowed to see it.
-- ============================================================
create or replace function public.get_collection(p_id uuid)
returns table (
  id                 uuid,
  owner_id           uuid,
  title              text,
  description        text,
  visibility         public.visibility,
  activity_enabled   boolean,
  created_at         timestamptz,
  owner_username     text,
  owner_display_name text,
  owner_avatar_url   text,
  item_count         int,
  is_following       boolean,
  is_owner           boolean,
  shared_with        jsonb
)
language sql stable security definer set search_path = public, private as $$
  select
    c.id, c.owner_id, c.title, c.description, c.visibility, c.activity_enabled, c.created_at,
    p.username, p.display_name, p.avatar_url,
    (select count(*) from public.collection_items i where i.collection_id = c.id)::int as item_count,
    exists (
      select 1 from public.collection_followers cf
      where cf.collection_id = c.id and cf.user_id = auth.uid()
    ) as is_following,
    (c.owner_id = auth.uid()) as is_owner,
    case
      when c.owner_id = auth.uid() then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', s.user_id, 'username', sp.username,
            'display_name', sp.display_name, 'avatar_url', sp.avatar_url
          ) order by sp.username
        )
        from public.collection_shares s
        join public.profiles sp on sp.id = s.user_id
        where s.collection_id = c.id
      ), '[]'::jsonb)
    end as shared_with
  from public.collections c
  join public.profiles p on p.id = c.owner_id
  where c.id = p_id
    and private.can_view_collection(c.id, auth.uid());
$$;

-- ============================================================
-- RPC: get_collections_for_profile — visible collections of a profile
-- ============================================================
create or replace function public.get_collections_for_profile(p_owner_id uuid)
returns table (
  id           uuid,
  owner_id     uuid,
  title        text,
  description  text,
  visibility   public.visibility,
  created_at   timestamptz,
  item_count   int,
  is_following boolean,
  is_owner     boolean
)
language sql stable security definer set search_path = public, private as $$
  select
    c.id, c.owner_id, c.title, c.description, c.visibility, c.created_at,
    (select count(*) from public.collection_items i where i.collection_id = c.id)::int as item_count,
    exists (
      select 1 from public.collection_followers cf
      where cf.collection_id = c.id and cf.user_id = auth.uid()
    ) as is_following,
    (c.owner_id = auth.uid()) as is_owner
  from public.collections c
  where c.owner_id = p_owner_id
    and private.can_view_collection(c.id, auth.uid())
  order by c.created_at desc;
$$;

-- ============================================================
-- RPC: get_collection_items — items of a visible collection
-- ============================================================
create or replace function public.get_collection_items(p_collection_id uuid)
returns table (
  id            uuid,
  collection_id uuid,
  platform      public.platform,
  external_id   text,
  name          text,
  avatar_url    text,
  url           text,
  added_at      timestamptz
)
language sql stable security definer set search_path = public, private as $$
  select i.id, i.collection_id, i.platform, i.external_id, i.name, i.avatar_url, i.url, i.added_at
  from public.collection_items i
  where i.collection_id = p_collection_id
    and private.can_view_collection(p_collection_id, auth.uid())
  order by i.added_at desc, i.id;
$$;
