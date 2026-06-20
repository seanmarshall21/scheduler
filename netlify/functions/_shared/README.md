# Netlify functions — Google Calendar (staged from CRFTD)

The four `google-*.js` functions here are **lifted verbatim from CRFTD** as a
reference to adapt. They are battle-tested and carry logic worth keeping:

- multi-account OAuth + access-token refresh
- per-account treatment (`schedule_around` / `ask` / `show`)
- privacy "busy-only" mode (hide titles)
- cross-account de-dupe by `iCalUID`
- per-calendar on/off toggles
- read + write (incl. recurrence: this event / whole series)
- declined-event filtering

## Adaptation needed before they run in Hearth

They currently read CRFTD's **`calendar_connections`** table and its column
names. Hearth uses **`google_connections`** (see
`supabase/migrations/0001_init.sql`) keyed by **member**. Remap:

| CRFTD (`calendar_connections`) | Hearth (`google_connections`)        |
| ------------------------------ | ------------------------------------ |
| `provider = 'google'`          | (table is Google-only — drop filter) |
| `is_private`                   | `busy_only`                          |
| `can_write`                    | derive from granted scope            |
| `disabled_calendars` (array)   | `calendars` jsonb `[{id,enabled}]`   |
| (per user via JWT)             | per **member**; scope by household   |

Also: events should be tagged with `member_id` so the calendar can color them
per person. Wire `useGoogleCalendar` (to be ported) to call these and merge the
returned events into `FamilyCalendar`'s `events` prop.
