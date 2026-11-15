# Test checklist

Manual QA pass for the whole app, against a local dev database seeded by `0004_seed.sql`.

**Demo accounts** (password `subshare123`): `ahmad@subshare.dev`, `sara@subshare.dev`, `rafi@subshare.dev`, `nadia@subshare.dev` — **nadia is private**.

Handy trick: use two browser windows (or one normal + one incognito) with different accounts signed in, to test realtime and follow flows side by side.

## 0. Setup sanity

- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all pass
- [ ] SQL — every table has RLS enabled:

  ```sql
  select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
  -- 9 rows, all rowsecurity = true
  ```

- [ ] Each demo account signs in successfully
- [ ] At least one account already has a notification badge (the seed generates notification history)

## 1. Auth (email only)

- [ ] Sign up with a fresh email → onboarding → pick username/display name → app home
- [ ] Sign out → sign back in with that email → straight to Home
- [ ] Wrong password shows a clear error, no crash
- [ ] There is **no** "Continue with Google" button on Sign in / Sign up (SubShare is email-only)
- [ ] Signed-out users hitting `/onboarding` or app pages are redirected to sign-in

## 2. Profiles

- [ ] Own profile shows name, @username, bio, avatar, and your collections
- [ ] Edit profile: change display name + bio, upload an avatar (lands in the `avatars` bucket), save persists after reload
- [ ] Toggle **private account** on → another user sees the private state with a follow-request button
- [ ] A stranger viewing a public profile sees its public collections
- [ ] Viewing **nadia** as rafi: private lock + request button, no collections visible, no broken UI

## 3. Follow system

- [ ] Follow **sara** as rafi (public) → instantly "Following", no approval step
- [ ] Request **nadia** as rafi (private) → becomes "Requested"/pending
- [ ] As nadia: Friends → **Requests** tab shows rafi → **Accept** makes both sides "Following"; **Decline** removes it
- [ ] Unfollow → button flips back, they leave your following list
- [ ] Friends tabs (Following / Followers / Requests) show correct counts and people
- [ ] Nadia's follower/following lists are NOT visible to strangers (RLS)

## 4. Collections & items

- [ ] Create a collection for each visibility: **public**, **private**, **selected** (add sara in the shares editor)
- [ ] Add an item by pasting `https://www.youtube.com/@veritasium`:
  - with the `metadata` function deployed, **Fetch** fills name + thumbnail
  - without it, you get the "type the name" toast — the item is still addable
- [ ] **YouTube-only**: pasting a non-YouTube link (`github.com/…`, `open.spotify.com/…`, `stripe.com/blog`) shows the "SubShare is YouTube-only" hint and the Save button stays disabled; the toast explains it too
- [ ] Pasting a video link (`youtu.be/…`, `youtube.com/watch?v=…`) fetches the video title + thumbnail
- [ ] Adding the same link twice to one collection is rejected with a friendly toast
- [ ] Edit title/description/visibility/shares; changes persist after reload
- [ ] **Selected** collection: sara sees it (shared), rafi doesn't
- [ ] Delete an item, then a collection you created
- [ ] "Save to my collection" from someone else's public collection copies the item

## 5. Visibility in the UI

- [ ] As rafi: sara's **Private Picks** and nadia's **Personal** appear nowhere (profile, Discover, direct links)
- [ ] As sara: ahmad's **Learning & Science** (selected, shared with sara) is visible; as rafi it is not
- [ ] As sara, ahmad's profile lists "Learning & Science"; as rafi it's absent from the list
- [ ] Deep-linking to a hidden collection id shows the locked/not-found state, never the content

## 6. Activity feed

- [ ] rafi follows ahmad only → Home shows ahmad's activities on **Startup Channels** (public) but nothing from **Learning & Science** (selected, not shared with rafi)
- [ ] ahmad follows sara → ahmad sees sara's **Design & Code** activity but nothing about her **Private Picks**
- [ ] The feed shows other people's activity only — your own actions are excluded by design
- [ ] "Load more" fetches older activities (cursor pagination)
- [ ] Turning a collection's **activity switch** off stops new feed entries for it
- [ ] Loading shows skeletons; a new account with no follows sees a helpful empty state

## 7. Notifications (realtime)

Two windows: **A = ahmad** (follows sara), **B = sara**.

- [ ] B creates a public collection → A's nav badge increments within ~1 second **without refresh**; the list shows `new_collection`
- [ ] B adds an item to that collection → A receives `new_item_from_followed_user`
- [ ] A follows B's collection ("Follow collection") → B adds another item → A receives `new_item_in_followed_collection`
- [ ] rafi requests nadia → nadia gets `follow_request`; nadia accepts → rafi gets `request_accepted`
- [ ] Someone follows you → `new_follower`
- [ ] Mark one read, then "mark all read" → badge clears
- [ ] Settings → turn off a type (e.g. `new_follower`) → triggering it again creates no notification; other types still arrive
- [ ] Changes to a private/hidden collection never notify unauthorized users

## 8. Discover

- [ ] Search users by partial name/username (e.g. "sar" finds Sara)
- [ ] Search collections by title (e.g. "design")
- [ ] **Popular items** lists seed favorites (Fireship / Veritasium appear from multiple collections)
- [ ] **Suggested people** proposes users you don't follow yet and never includes yourself
- [ ] Results respect privacy: private profiles' collections never surface

## 9. RLS / privacy (SQL) — the required three

Run each block in the **Supabase SQL Editor**. The claims spoof makes the query run *as* that demo user; `begin … rollback` keeps everything read-only.

**A. Private profile is locked out of the social graph (nadia):**

```sql
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where username = 'rafi')::text,
                      'role', 'authenticated')::text, true);

  -- rafi cannot see nadia's follow rows (she is private and he is not her follower):
  select count(*) as visible_rows from public.follows f
  where f.follower_id = (select id from public.profiles where username = 'nadia')
     or f.following_id = (select id from public.profiles where username = 'nadia');
  -- EXPECT: 0
rollback;
```

**B. Private collection is invisible:**

```sql
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where username = 'rafi')::text,
                      'role', 'authenticated')::text, true);

  -- sara's "Private Picks" (visibility = 'private'):
  select c.title from public.collections c
  join public.profiles p on p.id = c.owner_id
  where p.username = 'sara' and c.visibility = 'private';
  -- EXPECT: 0 rows (the collection exists, but rafi must not see it)

  -- its items are invisible too:
  select count(*) as visible_items from public.collection_items i
  join public.collections c on c.id = i.collection_id
  join public.profiles p on p.id = c.owner_id
  where p.username = 'sara' and c.visibility = 'private';
  -- EXPECT: 0
rollback;
```

**C. "Selected" sharing honors the share list:**

```sql
-- as SARA (shared user):
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where username = 'sara')::text,
                      'role', 'authenticated')::text, true);
  select c.title from public.collections c
  join public.profiles p on p.id = c.owner_id
  where p.username = 'ahmad' and c.visibility = 'selected';
  -- EXPECT: 1 row ("Learning & Science")
rollback;

-- as RAFI (follows ahmad, but not shared):
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where username = 'rafi')::text,
                      'role', 'authenticated')::text, true);
  select c.title from public.collections c
  join public.profiles p on p.id = c.owner_id
  where p.username = 'ahmad' and c.visibility = 'selected';
  -- EXPECT: 0 rows
rollback;
```

**Bonus — notifications stay private:**

```sql
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where username = 'ahmad')::text,
                      'role', 'authenticated')::text, true);
  select count(distinct user_id) as owners from public.notifications;
  -- EXPECT: 1 (only ahmad's own rows are visible)
rollback;
```

## 10. PWA

- [ ] `npm run build` emits `dist/sw.js` and `dist/manifest.webmanifest`
- [ ] `npm run preview` → Chrome offers to install; installed app opens standalone with the correct blue icon
- [ ] With the app cached, DevTools → Network → Offline + reload still renders the app shell
- [ ] `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-512.png`, `/icons/apple-touch-icon.png` all resolve

## 11. YouTube connection

Needs the Google OAuth secrets + deployed functions from `docs/platform-setup.md`. Without them the connect button explains what's missing — that graceful fallback is itself worth checking.

- [ ] Platforms page shows a single **YouTube** card (no other platform cards)
- [ ] **Connect YouTube** → Google consent (youtube.readonly) → back on `/platforms` with a success toast and a "Connected" badge
- [ ] **Sync now** → toast "Found N channels — M waiting in the import inbox"; the inbox lists your subscribed channels with avatars
- [ ] **Add all to a collection…** → modal (name + visibility) → **Create & import** → a new collection appears with every inbox channel in it; the toast says "Imported N channels"; the inbox empties
- [ ] Friends' feeds show **only** one `created a collection` activity from the bulk import (no notification flood per channel)
- [ ] **Add** from inbox → SaveItemDialog → the item lands in the chosen collection (friends get notified per the normal rules) and the row leaves the inbox
- [ ] **Dismiss** (X) → the row disappears and re-syncing does NOT bring dismissed or imported rows back
- [ ] Disconnect (after confirm) → badge flips back to "Not connected"; inbox rows are kept
- [ ] When tokens expire, the badge shows "Reconnect needed" and sync tells you to reconnect
- [ ] Connecting writes a `platform_connected` activity → friends' feed shows "connected YouTube to SubShare"
- [ ] SQL — the connections table is invisible to clients, so tokens can never reach a browser:

  ```sql
  begin;
    set local role authenticated;
    select set_config('request.jwt.claims',
      json_build_object('sub', (select id from public.profiles where username = 'ahmad')::text,
                        'role', 'authenticated')::text, true);
    select count(*) as visible_connections from public.platform_connections;
    -- EXPECT: 0 (even your own row — the UI uses the list_my_connections RPC instead)
  rollback;
  ```

- [ ] The UI lists your connections via the `list_my_connections` RPC, and no network response anywhere contains a token field

## 12. Before you deploy to Vercel

- [ ] Push to GitHub; import to Vercel; set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` env vars
- [ ] Supabase: **Site URL** → production URL; **Redirect URLs** += `https://YOUR-APP.vercel.app/**`
- [ ] Google Cloud console: add the Vercel domain to *Authorized JavaScript origins* (the YouTube OAuth return origin)
- [ ] OAuth client: register `https://YOUR-PROJECT-REF.supabase.co/functions/v1/platform-oauth-callback` (see `docs/platform-setup.md`), set the secrets, then `npx supabase functions deploy`
- [ ] On the deployed URL: sign up, add an item, trigger a notification, connect + sync YouTube — full smoke test
