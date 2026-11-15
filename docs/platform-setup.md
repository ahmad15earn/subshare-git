# YouTube connection setup

How to switch on SubShare's one integration: **connecting your YouTube account** (read-only) so Sync can pull your subscriptions. Email sign-in needs no Google setup at all — Google Cloud is only for this.

## 0. Prerequisites

- Migrations `0001`–`0005` have been run in the SQL editor (see `docs/supabase-setup.md`).
- Supabase CLI linked:

  ```bash
  npx supabase login
  npx supabase link --project-ref YOUR-PROJECT-REF
  ```

## 1. Generate an encryption key

OAuth tokens are AES-GCM-encrypted before they are ever stored:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# or: openssl rand -base64 32
```

## 2. Google Cloud (one project, two credentials)

1. [Google Cloud Console](https://console.cloud.google.com) → create or select a project.
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**. Without this, sync fails with `upstream 403`.
3. **OAuth consent screen**: External. Add the scope `https://www.googleapis.com/auth/youtube.readonly`. While the app is unverified, add yourself (and any testers) as **test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - *Authorized JavaScript origins*: `http://localhost:5173` (and your Vercel URL later)
   - *Authorized redirect URIs*: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/platform-oauth-callback` — exactly this URL; the project ref is in *Project Settings → General*.
5. Copy the **Client ID** and **Client secret**.

## 3. Optional: a plain Data API key for channel lookup

The **Fetch** button fills video titles/thumbnails via public oEmbed with no key. Channel links (`youtube.com/@handle`, `/channel/UC…`) are not covered by oEmbed — to auto-fill their name + avatar, create a plain **API key** (no OAuth):

**APIs & Services → Credentials → Create credentials → API key.** (Optionally restrict it to *YouTube Data API v3*.)

```bash
npx supabase secrets set YOUTUBE_API_KEY="AIza…"
```

Without it, channel links simply ask you to type the name — everything still works.

## 4. Set the secrets, deploy the functions

```bash
npx supabase secrets set \
  PLATFORM_ENCRYPTION_KEY="…" \
  GOOGLE_CLIENT_ID="…"        GOOGLE_CLIENT_SECRET="…"

npx supabase functions deploy
```

That's all three secrets (plus the optional `YOUTUBE_API_KEY` from step 3). `npx supabase functions deploy` deploys the four functions (`metadata`, `platform-oauth-start`, `platform-oauth-callback`, `platform-sync`). `supabase/config.toml` already turns JWT verification off for `platform-oauth-callback` only — Google redirects the browser there without a Supabase JWT, and the function instead verifies its HMAC-signed `state` parameter.

Optional fallback: `npx supabase secrets set APP_URL=https://your-app.vercel.app` — only used when an OAuth-start request carries no Origin header (normally never from the browser).

## 5. Try it

Platforms page → **Connect YouTube** → Google consent (`youtube.readonly` — SubShare can only *list* subscriptions, never post) → back on `/platforms` with a success toast and a "Connected" badge → **Sync now** → the import inbox fills with every channel you subscribe to → **Add all to a collection** to share them in one tap, or **Add** the ones you pick one by one.

For the full test pass, see `docs/test-checklist.md` §11.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Connect says "not configured yet" | `GOOGLE_CLIENT_ID` isn't set, or functions were deployed before the secrets were |
| Google shows `redirect_uri_mismatch` | The registered redirect URI isn't exactly `https://<ref>.supabase.co/functions/v1/platform-oauth-callback` |
| Google says the app is unverified / "testing" | Add yourself as a **test user** on the OAuth consent screen |
| Sync returns "reconnect_required" | Google access tokens expire (~1 h); hit **Reconnect**, or revoke/re-grant in Google Account → Third-party access |
| Sync fails with `upstream 403` | YouTube Data API v3 isn't enabled in the Google project |
| Back on the app with `invalid_state` | `PLATFORM_ENCRYPTION_KEY` changed after deploy, or JWT verification is accidentally on for the callback (check `config.toml`) |
| Channel links never auto-fill a name | That needs the optional `YOUTUBE_API_KEY` (step 3) — video links work without it |
