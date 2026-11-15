# Supabase setup (click-by-click)

Everything below is done once in the [Supabase dashboard](https://supabase.com/dashboard). Takes ~10 minutes. (The YouTube connection has its own guide: [`docs/platform-setup.md`](docs/platform-setup.md).)

## 1. Create the project

1. Sign in (or create an account) → **New project**.
2. Name it (e.g. `subshare`), pick a region close to your users, set a **database password** (save it somewhere).
3. Wait for provisioning (1–2 minutes).

## 2. Run the five migrations, in order

Open **SQL Editor** → **New query**. For each file below: open it in your editor, copy **the entire file**, paste it into the SQL editor, press **Run**, and wait for the success message before starting the next one.

| Order | File | What it creates |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | `pg_trgm` extension, enums, 9 tables, indexes, `updated_at` triggers |
| 2 | `supabase/migrations/0002_rls.sql` | RLS + policies on every table, realtime publication, `avatars` storage bucket |
| 3 | `supabase/migrations/0003_functions.sql` | user-creation hook, activity/notification triggers, privacy-gated RPCs |
| 4 | `supabase/migrations/0004_seed.sql` | 4 demo users + demo collections/items (**dev only**) |
| 5 | `supabase/migrations/0005_platforms.sql` | `platform_connections` + `platform_imports`, connection RPCs, `platform_connected` trigger |

Order matters: schema → policies → functions → seed → platforms.

**Verify:** *Table Editor* should now show `profiles` with 4 rows (ahmad, sara, rafi, nadia), 5 collections, and the two `platform_*` tables (empty). Also confirm RLS is on everywhere:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
-- every row must show rowsecurity = true
```

## 3. Email provider

**Authentication → Providers → Email** — enabled by default. Two choices:

- **Keep "Confirm email" ON** (default, recommended): new signups receive a confirmation link that opens `<your-app>/auth/callback`, which the app handles.
- **Turn it OFF** for the fastest local testing: signups land straight in onboarding.

The four seed users have confirmed emails either way.

## 4. URL configuration (important)

**Authentication → URL Configuration**:

- **Site URL** — your app's "main" address. For local dev: `http://localhost:5173`. Change it to your Vercel URL when you deploy.
- **Redirect URLs** — add every app origin you'll use (the app sends users to `<origin>/auth/callback` after email confirmation):
  - `http://localhost:5173/**`
  - `http://localhost:5173`
  - later: `https://YOUR-APP.vercel.app/**`

If a redirect is missing, the confirmation link fails with Supabase's "redirect URL not allowed" error instead of opening the app.

## 5. Google sign-in — not used

SubShare signs everyone in with **email + password**; there is no third-party sign-in provider, so nothing to configure here. The only Google setup in the project is the **YouTube connection**, which has its own guide: [`docs/platform-setup.md`](docs/platform-setup.md).

## 6. Storage & Realtime — nothing to do

Migration `0002` already created the public **`avatars`** bucket (users can only write inside their own folder) and added `notifications`, `activities` and `follows` to the realtime publication. Glance at **Storage** and **Database → Realtime** if you want to confirm.

## 7. API keys → `.env.local`

**Project Settings → API** → copy:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key (or the newer `publishable` / `sb_publishable_…` key — both work) → `VITE_SUPABASE_ANON_KEY`

Paste them into `.env.local` (copy from `.env.example`). **Never** put the `service_role` key in the frontend.

## 8. Optional: deploy the `metadata` Edge Function

It powers the **Fetch** button when adding an item (auto-fills name/avatar from public oEmbed). The app degrades gracefully without it — the button just tells you to type the name manually.

```bash
npx supabase login            # opens the browser; may ask for a Supabase access token
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase functions deploy metadata
```

If the CLI complains about missing config, run `npx supabase init` first (creates `supabase/config.toml`; it coexists fine with these migrations).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid login credentials" | A migration didn't run, or the demo password is wrong (`subshare123`) |
| Confirmation email lands on "redirect not allowed" | Add the app origin to **Redirect URLs** (step 4) |
| App loads but everything is empty with console errors | `.env.local` missing or wrong; restart `npm run dev` after creating it |
| **Fetch** always falls back to manual entry | Edge function not deployed (step 8) — expected, non-blocking |
| Realtime badge never updates | Check **Database → Realtime** lists `notifications` in the publication |
