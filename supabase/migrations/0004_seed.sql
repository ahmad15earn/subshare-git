-- ============================================================
-- SubShare — Migration 0004: Seed data (LOCAL / DEV ONLY)
-- Creates 4 demo users (password: subshare123), follows, collections,
-- items. Activities & notifications are generated automatically by the
-- triggers from 0003.
--
-- Demo accounts (email / password):
--   ahmad@subshare.dev  / subshare123   (public)
--   sara@subshare.dev   / subshare123   (public)
--   rafi@subshare.dev   / subshare123   (public)
--   nadia@subshare.dev  / subshare123   (PRIVATE profile + private collection)
-- ============================================================

-- ============ Demo auth users ============
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  t.email,
  extensions.crypt('subshare123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', t.username, 'display_name', t.display_name),
  now(),
  now()
from (values
  ('ahmad', 'Ahmad Rahman', 'ahmad@subshare.dev'),
  ('sara',  'Sara Karim',   'sara@subshare.dev'),
  ('rafi',  'Rafi Chowdhury','rafi@subshare.dev'),
  ('nadia', 'Nadia Islam',  'nadia@subshare.dev')
) as t(username, display_name, email)
where not exists (select 1 from auth.users where email = t.email);

-- nadia is a private account (the profile row was auto-created by the trigger)
update public.profiles set is_private = true where username = 'nadia';

-- ============ Follows ============
-- sara, rafi, nadia follow ahmad; ahmad follows sara; ahmad requests nadia (pending)
insert into public.follows (follower_id, following_id, status)
select a.id, b.id, v.status::public.follow_status
from (values
  ('sara',  'ahmad', 'accepted'),
  ('rafi',  'ahmad', 'accepted'),
  ('nadia', 'ahmad', 'accepted'),
  ('ahmad', 'sara',  'accepted'),
  ('ahmad', 'nadia', 'pending')
) as v(follower, following, status)
join public.profiles a on a.username = v.follower
join public.profiles b on b.username = v.following
on conflict do nothing;

-- ============ Ahmad's collections ============
insert into public.collections (owner_id, title, description, visibility)
values (
  (select id from public.profiles where username = 'ahmad'),
  'Startup Channels',
  'The startup and VC channels I never skip.',
  'public'
);

insert into public.collections (owner_id, title, description, visibility)
values (
  (select id from public.profiles where username = 'ahmad'),
  'Learning & Science',
  'Stuff that makes me smarter. Shared with a few friends.',
  'selected'
);

insert into public.collection_shares (collection_id, user_id)
select c.id, p.id
from public.collections c, public.profiles p
where c.title = 'Learning & Science' and p.username = 'sara';

insert into public.collection_items (collection_id, platform, external_id, name, avatar_url, url, added_at)
values
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'ahmad' and c.title = 'Startup Channels'),
   'youtube', 'UCcefcZRL2oaA_uBNeo5UOWg', 'Y Combinator', null, 'https://www.youtube.com/@ycombinator', now() - interval '3 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'ahmad' and c.title = 'Startup Channels'),
   'youtube', null, 'a16z', null, 'https://www.youtube.com/@a16z', now() - interval '2 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'ahmad' and c.title = 'Startup Channels'),
   'youtube', null, 'Stripe', null, 'https://www.youtube.com/@stripe', now() - interval '1 day'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'ahmad' and c.title = 'Learning & Science'),
   'youtube', 'UCHnyfMqiRRG1u-2MsSQLbXA', 'Veritasium', null, 'https://www.youtube.com/@veritasium', now() - interval '2 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'ahmad' and c.title = 'Learning & Science'),
   'youtube', null, 'Fireship', null, 'https://www.youtube.com/@Fireship', now() - interval '1 day');

-- ============ Sara's collections ============
insert into public.collections (owner_id, title, description, visibility)
values (
  (select id from public.profiles where username = 'sara'),
  'Design & Code',
  'Where I get my design + dev inspiration.',
  'public'
);

insert into public.collections (owner_id, title, description, visibility)
values (
  (select id from public.profiles where username = 'sara'),
  'Private Picks',
  'Just for me.',
  'private'
);

insert into public.collection_items (collection_id, platform, external_id, name, avatar_url, url, added_at)
values
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'sara' and c.title = 'Design & Code'),
   'youtube', null, 'Figma', null, 'https://www.youtube.com/@Figma', now() - interval '4 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'sara' and c.title = 'Design & Code'),
   'youtube', null, 'Fireship', null, 'https://www.youtube.com/@Fireship', now() - interval '3 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'sara' and c.title = 'Design & Code'),
   'youtube', null, 'Vercel', null, 'https://www.youtube.com/@vercel', now() - interval '2 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'sara' and c.title = 'Private Picks'),
   'youtube', null, 'Lenny''s Podcast', null, 'https://www.youtube.com/@LennysPodcast', now() - interval '1 day');

-- ============ Rafi's collection ============
insert into public.collections (owner_id, title, description, visibility)
values (
  (select id from public.profiles where username = 'rafi'),
  'Tech Talks',
  'Long-form tech conversations worth the time.',
  'public'
);

insert into public.collection_items (collection_id, platform, external_id, name, avatar_url, url, added_at)
values
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'rafi' and c.title = 'Tech Talks'),
   'youtube', null, 'Lex Fridman', null, 'https://www.youtube.com/@lexfridman', now() - interval '5 days'),
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'rafi' and c.title = 'Tech Talks'),
   'youtube', 'UCHnyfMqiRRG1u-2MsSQLbXA', 'Veritasium', null, 'https://www.youtube.com/@veritasium', now() - interval '4 days');

-- ============ Nadia's private collection ============
insert into public.collections (owner_id, title, description, visibility)
values (
  (select id from public.profiles where username = 'nadia'),
  'Personal',
  'My private list.',
  'private'
);

insert into public.collection_items (collection_id, platform, external_id, name, avatar_url, url, added_at)
values
  ((select c.id from public.collections c join public.profiles p on p.id = c.owner_id
      where p.username = 'nadia' and c.title = 'Personal'),
   'youtube', null, 'Lofi Girl', null, 'https://www.youtube.com/@LofiGirl', now() - interval '2 days');
