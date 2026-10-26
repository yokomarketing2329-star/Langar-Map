# Bhandara Map — *Find Food. Share Seva.*

A free, community-powered, installable web app (PWA) to find Bhandaras, Langars and free community food on a live map.

**New here? Open `DEPLOY.md` and follow it step by step.**

## How it works

- **Frontend:** React + Vite + TypeScript + Tailwind, map by Leaflet + OpenStreetMap (no API key, no card).
  Every place has a **Navigate with Google Maps** button.
- **Backend:** Supabase (free). The browser never writes to tables directly. All changes go through
  validated database functions (`create_bhandara`, `confirm_active`, `mark_inactive`, `update_details`,
  `report_bhandara`) that check input, rate-limit by anonymous visitor code, and block abusive visitors.
- **Photos:** compressed in the browser (max 1280 px; EXIF/GPS removed by re-encoding), uploaded to Supabase Storage
  (2 MB cap, images only, upload-only for the public).
- **Languages:** English, ਪੰਜਾਬੀ, हिंदी (defaults to the browser language).

## The time rules (all in Asia/Kolkata)

| Rule | Implementation |
|---|---|
| **A. 6 PM reset** | A place is *active* only if its last confirmation is **after the most recent 6:00 PM IST**. Computed at read time (`effective_status` in SQL, `status.ts` in the app) — no cron job needed. Nothing is deleted. Shows "Needs Evening Confirmation". |
| **B. Evening reactivation** | If a place is not currently active, **Still Active** requires a fresh photo and a confirmation tick (enforced by the database). It becomes active immediately, with a confirmation made after 6 PM, so that day's 6 PM reset cannot deactivate it again. |
| **C. 12-hour expiry** | `expires_at = last confirmation + 12 h`. Public queries only return rows with `expires_at > now()`, so expired places vanish even if no cleanup ever runs. The page re-evaluates at the exact moment of the next 6 PM flip or expiry (no refresh needed) and also re-fetches live data on changes/every 60 s. |

Marking a place inactive, or editing details, does **not** extend the 12-hour timer; only **Still Active** (or creating it) does.

## Project layout

```
supabase/migrations/001_init.sql   tables, rules, security (run once in Supabase SQL Editor)
src/lib/status.ts                  6 PM / 12 h rules in TypeScript (+ status.test.ts)
src/lib/api.ts                     the only code that talks to the database
src/lib/i18n.tsx                   English / Punjabi / Hindi text
src/components/                    map, list, add flow, details sheet, install button …
src/pages/Admin.tsx                /admin dashboard
public/                            manifest, service worker (offline shell), icons
```

## Run it on your own computer (optional)

```
npm install
cp .env.example .env     # then fill in the two Supabase values
npm run dev              # open the address it prints
npm test                 # runs the time-rule tests
npm run build            # production build
```

## Testing the time rules quickly

`npm test` runs the automated tests (6 PM boundary, midnight, month/year rollover, device-timezone
independence, reactivation, 12-hour expiry, restart-on-confirmation). To see the live behaviour in the
real database, in Supabase **SQL Editor** you can simulate "this place was last confirmed before 6 PM":

```sql
update public.bhandaras set last_verified_at = public.last_6pm_ist() - interval '1 minute'
where short_id = 'YOUR8CHARID';
```
Reload the app: it shows INACTIVE + "Needs Evening Confirmation". To simulate expiry:
`update public.bhandaras set expires_at = now() - interval '1 second' where short_id = '…';`
