# Bhandara Map — Setup & Deployment Guide (for beginners)

Follow the parts in order. Total time: about 45–60 minutes. **Everything below is free.**
You will **never** be asked for a credit card by the services used here at the free level
(Supabase, GitHub, Vercel). If a screen ever asks for one, stop and re-read the free-plan option.

> Screens on these websites change from time to time. If a button has a slightly different name,
> look for the closest match.

---

## Part 0 — Free-plan limits you should know BEFORE signing up

| Service | What it does | Free-plan things to know |
|---|---|---|
| **Supabase** | Database, photo storage, live updates | Free plan has limits on database size (~500 MB), photo storage (~1 GB) and monthly data transfer. **Free projects are automatically paused after about a week with no activity** – you can un-pause them with one click in the dashboard. Check <https://supabase.com/pricing> for current numbers. |
| **GitHub** | Stores your project files | Free. |
| **Vercel** (Hobby plan) | Puts the app on the internet | Free, but Vercel's Hobby plan is meant for **personal, non-commercial** use. A free community service is normally fine; if you ever accept payments/ads, check their terms or use **Cloudflare Pages** (also free) instead. |
| **OpenStreetMap map tiles** | The map pictures | Free with no key, but the public servers are for **light use**. If the app becomes very popular (thousands of daily users) you should switch to a free-tier tile provider with its own key (MapTiler, Stadia, etc.) – only one line in `MapView.tsx` / `LocationPicker.tsx` changes. |
| **Address search** (Nominatim) | "Search address" box | Free, about 1 search per second per user – fine for normal use. |

**Not included (honest limits):** there is no CAPTCHA. Protection against spam comes from
rate limits, photo-size limits, duplicate checks, reports and your admin dashboard. Because users
don't have accounts, a determined spammer can get around per-device limits (for example by clearing
browser data). If spam becomes a problem, the next step is adding Cloudflare Turnstile (free).

---

## Part 1 — Create the Supabase project (database + photos)

1. Go to <https://supabase.com> → **Start your project** → sign up (GitHub or email).
2. Click **New project**. Choose any name (e.g. `bhandara-map`), make up a strong **database password**
   (save it somewhere safe; you will rarely need it), and pick the **Region closest to your users**
   (e.g. *Mumbai / South Asia*). Choose the **Free** plan. Click **Create new project** and wait ~2 minutes.
3. **Create the tables and security rules:**
   - In the left menu click **SQL Editor** → **New query**.
   - Open the file `supabase/migrations/001_init.sql` from this project, copy **everything**, paste it
     into the editor, and press **Run**.
   - You should see "Success. No rows returned". If you see a red error, copy the message and ask for help.
   - This one file creates the tables, the 6 PM / 12-hour rules, the security policies, the
     photo storage bucket (2 MB limit, images only) and the live-update setting.
4. **Check storage:** left menu → **Storage**. You should see a bucket called **bhandara-photos**.
   (It is public for viewing; uploading is allowed only into its `uploads/` folder; nobody can delete or
   overwrite files except you.)
5. **Get your two connection values:** left menu → **Project Settings** (gear icon) → **API**.
   Copy:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon public** key (a long text)

   ⚠️ Do **not** use or share the `service_role` key anywhere. The app only needs the two values above.
   They are designed to be visible in a website; the database rules are what keep data safe.

### Create your admin login (for /admin)

6. Left menu → **Authentication** → **Users** → **Add user** → **Create new user**.
   Enter your email and a strong password; tick **Auto Confirm User** if shown.
7. **Stop strangers from creating accounts:** Authentication → **Sign In / Providers** (or **Settings**)
   → turn **OFF** "Allow new users to sign up". (Admin logins already exist; the public never needs one.)
8. Make that user an administrator: **SQL Editor** → **New query**, paste this (change the email), **Run**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'YOUR-EMAIL@example.com';
   ```
   It should say "Success… 1 row". Later you open `https://YOUR-SITE/admin` and sign in.

---

## Part 2 — Put the project on GitHub

1. Create a free account at <https://github.com>.
2. Click **+** (top right) → **New repository**. Name it `bhandara-map`, keep it **Public** or **Private**
   (both work), do **not** tick "Add a README". Click **Create repository**.
3. On the next page click **uploading an existing file**. Unzip the project folder on your computer,
   open it, **select everything inside** (not the folder itself) and drag it into the browser.
   Make sure the `src`, `public`, `supabase` folders and files like `package.json` are all there.
   Do **not** upload a `.env` file or a `node_modules` folder if you have them.
4. Click **Commit changes**.

---

## Part 3 — Publish on Vercel (gets you the public link)

1. Go to <https://vercel.com> → **Sign Up** → **Continue with GitHub** (choose the free **Hobby** plan).
2. Click **Add New… → Project**, find `bhandara-map`, click **Import**.
3. Vercel detects **Vite** automatically. Leave Build Command (`npm run build`) and Output Directory (`dist`) as they are.
4. Open **Environment Variables** and add two (names must match exactly):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL from Part 1 step 5 |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key from Part 1 step 5 |

5. Click **Deploy**. After ~1–2 minutes you get a link like `https://bhandara-map.vercel.app`.
   **That is your public website.** (You can add your own domain later under *Settings → Domains*.)

*Prefer Cloudflare Pages?* Create a project from the same GitHub repo with build command
`npm run build`, output directory `dist`, and the same two environment variables. It also gives a free link.

---

## Part 4 — Install on phones

**Android (Chrome):** open your link → tap the green **Install App** button in the app (or Chrome menu ⋮ →
*Install app / Add to Home screen*) → **Install**. It now opens full-screen like a normal app.

**iPhone / iPad (must be Safari):** open your link in **Safari** → tap the **Share** button (square with arrow) →
scroll → **Add to Home Screen** → **Add**. (iPhone has no one-tap install; the app shows these steps in the
selected language when you tap *Install App*.)

---

## Part 5 — Test with two phones (do this before sharing widely)

Use Phone A and Phone B, both with the link open.

| # | Test | Expected |
|---|---|---|
| 1 | Open the link on both phones | Map loads; allow location when asked → blue dot |
| 2 | Phone A: **Add Bhandara** → use current location → confirm → fill menu + photo → **Add to map** | Success message with Share button |
| 3 | Phone B (no refresh) | A green marker appears within a few seconds (live update; worst case ≤ 60 s) |
| 4 | Phone B: tap marker | Photo, menu, status, distance, last-verified time, address |
| 5 | Phone B: **Navigate with Google Maps** | Google Maps opens with directions |
| 6 | Phone A: **Share** → send link to Phone B and open it | App opens focused on that Bhandara |
| 7 | Add another within ~100 m of the first | "A Bhandara may already be here" appears |
| 8 | Tap **Mark Inactive** | Marker turns gray on both phones |
| 9 | Switch language (English / ਪੰਜਾਬੀ / हिंदी) | All labels change |
| 10 | Airplane mode, reopen app | App opens; friendly offline message |
| 11 | Open `/admin`, sign in | Stats, locations, reports; delete a test entry |
| 12 | **6 PM rule:** the next day after 6:00 PM IST open an entry added earlier that day (< 12 h old) | Shows "INACTIVE" + "Needs Evening Confirmation"; **Still Active** demands a fresh photo + checkbox, then turns green |
| 13 | **12-hour rule:** an entry with no confirmation for 12 h | Disappears from the map by itself |

Tip: you can also try the time rules instantly without waiting — see "Testing the time rules" in `README.md`.

---

## Part 6 — Day-to-day

- **Delete fake entries / handle reports:** `https://YOUR-SITE/admin`.
- **Optional cleanup of very old expired rows:** SQL Editor → run `select public.cleanup_expired();`
  (the app works correctly without ever doing this; expired entries are already hidden).
- **If the site shows "not connected to its database":** the two environment variables on Vercel are missing
  or wrong. Fix them under *Project → Settings → Environment Variables*, then *Deployments → Redeploy*.
- **If the app stops loading after a quiet week:** open the Supabase dashboard and click **Restore / Resume project**.
