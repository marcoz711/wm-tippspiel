# STATUS — WM-Tippspiel 2026

**Updated:** 2026-06-09 ~23:00 (Berlin) — **LIVE & VERIFIED** ✅

## What this is
Family betting game for the FIFA World Cup 2026 (June 11 – July 19). Static web app, no build step. Built by Neo 2026-06-09 on Marc's Discord request, same evening from idea to live.

- **Live:** https://thebruce030.github.io/wm-tippspiel/ (GitHub Pages, repo `thebruce030/wm-tippspiel`)
- Marc may additionally deploy via Vercel + `wm.marcusbirke.de` (his idea, app is domain-independent)
- **Local dev:** `python -m http.server 8123` in repo root

## Verified end-to-end (2026-06-09)
Two isolated browser profiles against the live URL: player creation with PIN, wrong-PIN rejection, tip on device A appears on device B in realtime without reload, DB wiped clean for family start.

## Architecture
- **Firebase:** project `wm-tippspiel-2026-bf3e4` (Google account **marcpage711@gmail.com**), RTDB `europe-west1`, anonymous auth enabled, rules `auth != null` + validation (deployed from `database.rules.json`). Spark plan, no card.
- **DB tree:** `players/{pid}` (name, emoji, SHA-256 pin) · `tips/{pid}/m{matchId}` · `results/m{matchId}` (`auto:true` = synced) · `bonus/{pid}` · `koTeams/m{matchId}`. Match keys are m-prefixed (RTDB array coercion!).
- **Auto-results:** `js/sync.js` ← openfootball worldcup.json (daily, no key, CORS-open). Manual entries always win. Activates at tournament start, every 6h per open client.
- **Data:** `data/matches.json` (104 fixtures, verified vs FIFA/Wikipedia/ESPN), `data/teams-info.json` (FIFA ranking Apr 2026 + Opta win probabilities — % not displayed per Marc, data kept).
- **CLI access:** firebase-tools logged in as marcpage711 on this machine (configstore). `.fb-login/` has the custom no-localhost OAuth scripts (gitignored). Known quirk: `addFirebase` API 403s for this account; project was created via console, everything else (RTDB create, anon-auth enable, rules deploy) works via API/CLI.

## Rules (as shipped)
Kicktipp standard: exact 4 / goal-diff 3 / tendency 2 (draw tip on different draw = 3). KO matches scored after 90 min. Champion bonus 10 pts, locked at opening kickoff. Tips hidden until kickoff. Tie-break: points → exact → diff. Tagessieger panel on leaderboard.

## During the tournament (maintenance hints)
- If openfootball lags/misnames a team: family enters results manually (pencil icon on locked match cards) — manual wins.
- KO pairings: auto-set from openfootball once known; can also be set manually in the result form (team dropdowns appear for placeholder matches).
- Final with 90-min draw: result form asks who advances (champion derivation needs it).
- DB admin (read/wipe): see token pattern in `.fb-login/` scripts; root URL `https://wm-tippspiel-2026-bf3e4-default-rtdb.europe-west1.firebasedatabase.app`.

## Backlog (researched, not built)
Joker/double points per round · escalating KO points · finalists/top-scorer bonus · tip reminders · Google sign-in (Marc asked, deferred: flaky on iOS Safari free domains; retrofittable without data loss) · live in-match table.
