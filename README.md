# Hearth — Family Hub

A family/home shared calendar, tasks, and notes hub. Built to run on a
wall-mounted kitchen **touchscreen** (always-on kiosk) and on each person's
**phone**. Everyone sees each other's schedules inline, color-coded per person,
so the household coordinates at a glance.

Standalone app — adapted from (not a fork of) CRFTD. Its own repo, its own
Supabase project, its own Netlify site.

## Features

- **Combined multi-person calendar** — everyone's blocks + Google events in
  color-coded lanes. Day view = one lane per person; week view = days with
  per-person overlay. Drag/resize blocks, tap empty space to add.
- **Shared tasks** — app-native, assignable between members, with due dates.
- **Shared notes & checklists** — household notes everyone can add to / check off.
- **Day-blocking** — drop time blocks (groceries, soccer, date night).
- **Kiosk home** — big clock + today's combined agenda + quick "who am I" switch.
- **Google Calendar (multi-account)** — ported from CRFTD; wiring in progress.

## Stack

React 18 + Vite + Tailwind · installable PWA · Supabase (Postgres + RLS + Auth) ·
Netlify (hosting + functions). DM Sans / DM Mono, warm "oat + terracotta" skin.

## Local development

```bash
npm install
cp .env.example .env     # fill in Supabase values
npm run dev              # http://localhost:5173
```

Functions run locally with the Netlify CLI:

```bash
npm i -g netlify-cli
netlify dev
```

## First-time setup (separate accounts)

This app is meant to live in its **own** GitHub repo / Supabase project /
Netlify site, separate from CRFTD.

### 1. New GitHub repo

```bash
cd family-cal          # this folder is self-contained
git init && git add -A && git commit -m "Hearth: initial scaffold"
# create an empty repo on GitHub, then:
git remote add origin git@github.com:<you>/hearth.git
git push -u origin main
```

### 2. New Supabase project

1. Create a new project at https://supabase.com (separate from CRFTD).
2. SQL editor → run `supabase/migrations/0001_init.sql`.
3. Copy the project URL + anon key into `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Add the service-role key as `SUPABASE_SERVICE_ROLE_KEY` (functions only).
5. Sign up once in the app, then optionally run `supabase/seed.sql` to create a
   demo household + members.

### 3. New Netlify site

1. "Add new site" → import the new GitHub repo.
2. Build command `npm run build`, publish dir `dist` (already in `netlify.toml`).
3. Set env vars (Supabase + Google + VAPID) in Site settings → Environment.

### 4. Google Calendar (reusing CRFTD's Google Cloud project)

1. In Google Cloud Console → the existing CRFTD OAuth client, add this app's
   redirect URI(s) to **Authorized redirect URIs**, e.g.
   `https://<your-netlify-site>.netlify.app/.netlify/functions/google-oauth-exchange`
   and `http://localhost:8888/.netlify/functions/google-oauth-exchange` for
   local `netlify dev`.
2. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` in
   the Netlify env + local `.env`.
3. See `netlify/functions/_shared/README.md` — the four staged `google-*`
   functions need remapping from CRFTD's `calendar_connections` to Hearth's
   `google_connections` table before they run.

## Data model

`households` · `members` (name, color, optional PIN) · `google_connections`
(per member) · `schedule_blocks` (day-blocking, per member) · `tasks`
(app-native, assignable) · `notes` (shared or per-member). See
`supabase/migrations/0001_init.sql`. RLS scopes everything to the household.

## Auth model (hybrid)

The kitchen kiosk signs in once with a shared household account and uses the
client-side **"who am I"** switch to set the active person (no fussy per-person
login on the wall). On phones, each person signs in with their own email and is
linked to their member row.
