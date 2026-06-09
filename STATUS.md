# STATUS — WM-Tippspiel 2026

**Updated:** 2026-06-09 ~21:45 (Berlin)

## What this is
Family betting game ("Tippspiel") for the FIFA World Cup 2026 (June 11 – July 19). Static web app, no build step, built by Neo on Marc's request via Discord (2026-06-09).

- **Live:** https://thebruce030.github.io/wm-tippspiel/ (GitHub Pages, repo `thebruce030/wm-tippspiel`)
- **Persistence:** Firebase Realtime Database (Spark/free) — setup IN PROGRESS, see below
- **Local dev:** `python -m http.server 8123` in repo root

## Current state
- ✅ App core complete and browser-verified: match tipping (steppers, lock at kickoff), leaderboard with Kicktipp scoring (4/3/2), Tagessieger panel, Teams tab (group cards → live standings after kickoff + FIFA world ranking), champion bonus tip (10 pts), result entry, DE/EN, PIN-protected players, Twemoji flags (Windows fix)
- ✅ Verified data: `data/matches.json` (all 104 fixtures, cross-checked FIFA/Wikipedia/ESPN), `data/teams-info.json` (FIFA ranking April 2026 + Opta probabilities — % currently not displayed per Marc's wish, data kept)
- ✅ Auto-results: `js/sync.js` pulls openfootball worldcup.json (daily updates, manual entries win), activates at tournament start
- 🔄 **Firebase setup blocked mid-way:** CLI login as marcpage711@gmail.com works (custom no-localhost OAuth flow in `.fb-login/`), GCP project `wm-tippspiel-fam-2026` created, but `addFirebase` API returns 403 no matter what (scopes/IAM verified OK — console-internal grant suspected). **Marc is creating the Firebase project manually via phone console** ("WM Tippspiel 2026"). Then: `firebase apps:create WEB` → sdkconfig → `database:instances:create` (europe-west1) → `node .fb-login/enable-anon-auth.cjs <project>` → `firebase deploy --only database` → paste config into `js/config.js` → push.

## Key decisions
- Scoring: Kicktipp standard (exact 4 / diff 3 / tendency 2), KO scored after 90 min (draws tippable), champion bonus 10 pts locked at opening match. Tie-break: points → exact hits → diff hits.
- Tips hidden until kickoff, then visible to all. No accounts: pick name + min-4-char PIN (SHA-256, family-level security).
- Firebase RTDB chosen over Supabase (pauses after 7d inactivity) / jsonbin (no rules) / PocketBase (needs host). Rules: `auth != null` via anonymous sign-in.
- DB tree: `players/{pid}`, `tips/{pid}/{matchId}`, `results/{matchId}` (`auto:true` flag for synced), `bonus/{pid}`, `koTeams/{matchId}`.

## Next
1. Finish Firebase wiring once Marc's project exists (see commands above)
2. End-to-end multi-device test (two browser profiles)
3. Send family link + how-to to Marc
4. Backlog ideas (researched, not built): joker/double-points per round, escalating KO points, tip reminders, finalists/top-scorer bonus questions
