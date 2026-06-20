# Netlify functions — Google Calendar

The four `google-*.js` functions were lifted from CRFTD and **remapped to
Commons's schema**. They carry logic worth keeping:

- multi-account OAuth + access-token refresh
- per-account treatment (`schedule_around` / `ask` / `show`)
- privacy "busy-only" mode (hide titles)
- cross-account de-dupe by `iCalUID`
- per-calendar on/off toggles
- read + write (incl. recurrence: this event / whole series)
- declined-event filtering

## What the remap changed (CRFTD → Commons)

They now read Commons's **`google_connections`** table (see
`supabase/migrations/0001_init.sql`), keyed by **member** and scoped by
**household** via RLS:

| CRFTD (`calendar_connections`)   | Commons (`google_connections`)                     |
| -------------------------------- | ------------------------------------------------- |
| `provider = 'google'` filter     | dropped (table is Google-only)                    |
| keyed per auth user (`user_id`)  | keyed per **member** (`member_id` + `household_id`) |
| `is_private`                     | `busy_only`                                       |
| `can_write` column               | derived from Google `accessRole` (no column)      |
| `disabled_calendars` (text[])    | `calendars` jsonb `[{ id, enabled }]`             |
| `profiles.clickup_user_id` key   | events/busy keyed by `member_id`                  |
| treatment `around/ask/show`      | treatment `schedule_around/ask/show`              |

Every event returned by `google-calendar-events` is tagged with `memberId` so
`FamilyCalendar` can color it per person.

## Client contract (for the `useGoogleCalendar` hook, still to be ported)

- **`google-oauth-exchange`** — body `{ code, redirectUri, memberId? }`. The
  kiosk (one shared login) must pass the active `memberId`; on a phone it
  defaults to the member linked to the signed-in user. Connection is upserted on
  `(member_id, google_email)`.
- **`google-calendar-events`** — body `{ timeMin, timeMax }`. Returns
  `{ connected, accounts, events }`; each event has `memberId`, `editable`, and
  write handles (`connId`, `calId`, `gid`, `seriesId`).
- **`google-calendar-team-busy`** — body `{ timeMin, timeMax }`. Returns
  `{ configured, byPerson }` keyed by `member_id`; titles stripped when
  `busy_only`. Needs `SUPABASE_SERVICE_ROLE_KEY`.
- **`google-calendar-event-write`** — body
  `{ connId, calId, gid, seriesId?, scope?, action: 'delete'|'patch', start?, end?, summary? }`.

Wired up: `src/hooks/useGoogleCalendar.js` drives the connect/exchange flow and
loads events; the **Settings** page manages connections (busy-only + per-calendar
toggles); `FamilyCalendar` renders the events per member. Browser needs
`VITE_GOOGLE_CLIENT_ID`; the OAuth redirect returns to `/settings`.

Separately, `crftd-schedule.js` bridges the CRFTD work schedule (reads CRFTD's
`schedule_blocks` via service role + resolves ClickUp titles/colors) — see
`src/hooks/useWorkSchedule.js`. Env: `CRFTD_SUPABASE_URL`,
`CRFTD_SUPABASE_SERVICE_ROLE_KEY`, `CLICKUP_API_TOKEN`, `CLICKUP_USER_MAP`.
