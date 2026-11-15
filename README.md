# SubShare

**SubShare is a small social app for sharing what you follow — built entirely around YouTube.** Connect your YouTube account (read-only), see every channel you subscribe to, and share them with friends as Collections. Follow other people's collections to discover new channels together. No posts, no comments, no DMs — just collections.

> **Status: Phase 1 + Phase 2 complete, YouTube-only.** Email sign-in for everyone; YouTube connects via official Google OAuth (`youtube.readonly`, read-only). Other platforms were removed from the product. See [`docs/platform-setup.md`](docs/platform-setup.md) to switch YouTube on.

## Features

- **Auth** — email + password for everyone (no third-party sign-in), first-run onboarding
- **Profiles** — public or private accounts; editable name, username, bio, avatar
- **Follow system** — instant follow for public accounts, follow *requests* for private ones (accept/decline)
- **Collections** — named groups of YouTube channels/videos with **public / private / selected friends** visibility and a per-collection activity switch
- **Items** — paste a `youtube.com` / `youtu.be` link (channels or videos); the **Fetch** button auto-fills the name + avatar (videos via oEmbed, channels via the optional YouTube Data API key) — with graceful manual-entry fallback. Non-YouTube links are rejected with a friendly message.
- **Connect YouTube** — official Google OAuth with the read-only `youtube.readonly` scope; on-demand **Sync now** pulls your subscriptions into a private import inbox, and **Add all to a collection** turns the whole list into one shareable collection in a single tap
- **Activity feed** — what the people you follow add to collections you're allowed to see
- **Follow a collection** — get notified when it gets new items
- **Notifications** — realtime, unread badge in the nav, per-type switches in Settings
- **Discover** — search people & collections, popular items, suggested people
- **PWA** — installable app with an offline shell

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 7 + TypeScript (strict) |
| Routing / data | React Router 7, TanStack Query 5 |
| Styling | Tailwind CSS 4 |
| Backend | Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions) |
| Hosting | Vercel (SPA rewrite in `vercel.json`) |
| PWA | vite-plugin-pwa (Workbox) |

## Quick start

**1. Set up Supabase** — full click-by-click guide: [`docs/supabase-setup.md`](docs/supabase-setup.md).
Short version: create a project, then run the five SQL files from `supabase/migrations/` **in order** (`0001` → `0005`) in the Supabase SQL editor. That creates every table, RLS policy, trigger, RPC, and the demo data below.

**2. Create `.env.local`** (copy `.env.example`) with the values from *Supabase → Project Settings → API*:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

**3. Install and run**

```bash
npm install
npm run dev        # http://localhost:5173
```

**4. Sign in with a demo account** (created by `0004_seed.sql`):

| Name | Email | Password | Profile |
|---|---|---|---|
| Ahmad | ahmad@subshare.dev | subshare123 | public |
| Sara | sara@subshare.dev | subshare123 | public |
| Rafi | rafi@subshare.dev | subshare123 | public |
| Nadia | nadia@subshare.dev | subshare123 | **private** |

They already follow each other and have collections, activities and notifications — so the feed and the unread badge work immediately.

> The seed migration is for local/dev databases. Don't run `0004` on a database you want to keep clean.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Type-check + production build (also emits the PWA service worker) |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | TypeScript check only |
| `npm run lint` | ESLint |

## Edge Functions

| Function | Powers | Needs secrets |
|---|---|---|
| `metadata` | "Fetch" button when adding an item (video oEmbed + optional channel lookup) | optional `YOUTUBE_API_KEY` for channel links |
| `platform-oauth-start` / `platform-oauth-callback` | Connecting YouTube (Google OAuth, read-only) | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, `PLATFORM_ENCRYPTION_KEY` |
| `platform-sync` | "Sync now" → your subscriptions into the import inbox | same (uses stored tokens) |

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase functions deploy   # deploys all; per-function verify_jwt comes from config.toml
```

`platform-oauth-callback` runs with JWT verification off (Google redirects there without a Supabase JWT) — already configured in `supabase/config.toml`. Full key walkthrough: [`docs/platform-setup.md`](docs/platform-setup.md). Without the functions everything still works — items are entered manually and the Platforms page just explains what's missing.

Optional: `npx supabase secrets set YOUTUBE_API_KEY=…` (a plain Data API v3 key, no OAuth) lets the Fetch button fill channel names/avatars for `youtube.com/@handle` and `/channel/UC…` links. No other secrets are needed — `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically by the platform.

## Deploy to Vercel

1. Push the project to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Vercel auto-detects Vite (`npm run build`, output `dist`).
3. **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
4. Deploy, then in **Supabase → Authentication → URL Configuration**: set **Site URL** to your Vercel URL and add `https://YOUR-APP.vercel.app/**` to **Redirect URLs**, so email-confirmation links land on the live app.
5. If you use the YouTube connection in production, also add the Vercel domain to *Authorized JavaScript origins* in the Google Cloud console (used as the OAuth return origin).

## Security model

- **RLS is enabled on every table** (`0002_rls.sql`). Private profiles, private collections and "selected" shares are enforced by the database, not the UI.
- **Privacy-gated RPCs** (`0003_functions.sql`): the feed, profile activities, searches, popular items and collection readers are security-definer functions that re-check viewer permissions row by row.
- **Activities and notifications are written only by DB triggers** — the client has no insert path, so nothing can be forged.
- **OAuth tokens are AES-GCM encrypted** (`platform_connections`, `0005_platforms.sql`) and the table is invisible to clients — the UI uses the `list_my_connections` RPC, which never returns tokens.
- The browser holds only the anon key; never expose the `service_role` key to the frontend.

## Project structure

```
supabase/
  migrations/        # 0001 schema → 0005 platforms — run once, in order
  functions/         # Deno Edge Functions (metadata, OAuth start/callback, sync)
src/
  features/          # auth, follow, collections, platforms, profile, notifications, feed, discover…
  components/ui/     # small design-system kit (buttons, inputs, modal, toasts…)
  lib/               # supabase client, YouTube link helpers, utils
  types/             # hand-written Database types (mirrors the migrations)
```

## Roadmap

- ~~**Phase 2 — platform integrations**~~ ✅ done — then **pivoted to YouTube-only**: YouTube OAuth (subscriptions), import inbox, "Add all to a collection", `platform_connections` with encrypted tokens. The DB enum stays generic, so a second platform could be added later without a migration.
- **Phase 3 — hardening:** privacy/terms pages, rate limiting, request validation, account deletion.

## More docs

- [`docs/supabase-setup.md`](docs/supabase-setup.md) — Supabase project setup, auth, redirects
- [`docs/platform-setup.md`](docs/platform-setup.md) — the YouTube connection: Google OAuth client, optional Data API key, secrets, function deploy
- [`docs/test-checklist.md`](docs/test-checklist.md) — manual QA checklist, including the privacy/RLS tests
