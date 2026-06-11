# STATUS — WM-Tippspiel 2026

**Updated:** 2026-06-11 ~22:00 (Berlin) — **LIVE & VERIFIED** ✅ (busy live-tuning session during the opening match)

## Latest (2026-06-11 evening, per Marc via Discord)
- **3rd-place prize float fix** (`ea961fe`): Regeln pot line passed raw `STAKE.split` products → `14 × 0.2 = 2.80000000000000003 €`. Now uses the leaderboard's `fmt()` rounding → `2,8 €`.
- **Overlay click-outside / Esc to close** (`361c602`): backdrop tap or Escape dismisses the player-select overlay (new `state.overlayDismissed` stops `onData` auto-reopen). Lets family check who's playing without re-login; login still via 👤 chip or tapping a tip input.
- **Daily result-sync GitHub Action** (`a0574ec`, cron moved to 05:00 UTC / 07:00 Berlin in `9f208fd`): `scripts/sync-results.mjs` ports `js/sync.js` to a standalone job; pulls openfootball results into Firebase via anonymous auth (public apiKey, **no secrets**) so standings update without anyone opening the app. In-app 6h sync still runs. Manual run via Actions tab or the admin Sync button.
- **Bosnia alias fix** (`a0574ec`): openfootball uses "Bosnia & Herzegovina" (ampersand); our key is "Bosnia and Herzegovina". Without the alias, Bosnia's 3 group games never auto-synced (client too). Group pairing now 72/72.
- **KO auto-sync fixed** (`9f208fd`): openfootball ships a reliable `num` for R32..SF that equals our match `id` (validated against stage); Third place + Final have no num but are each the only match in their stage → mapped by round. Replaced the dead `trustNum` path (group games carry no num). Applied to both `js/sync.js` and the Action.
- **Admin-only result entry** (`9f208fd`): manual "enter result" UI now gated to `ADMIN_PIDS` (`['marcus']`) — family can't enter results by accident. Auto-sync unaffected.
- **Bonus screen** (`fa73297`): champion list countries left-aligned (2-col `.champ-list` grid); paid players (`PAID_PIDS = marcus/oma/uta/karsten`) get a green ✓ badge; rules rewritten as two lists (points per match + worked 2:1 examples) with new DE/EN i18n keys; admin-only manual Sync button on the Bonus tab.

### Manual Firebase edits this session (admin overrides via REST anon-auth, per Marc — he's admin/owner)
- `bonus/c-o = Argentina` (champion). Flagged: set ~30 min after the kickoff lock (no advantage, reversible).
- `tips/vera/m1 = 2:1` (was 1:2). Marc override; technical audit found **no swap bug** — render/CSS/save are consistent, so the 1:2 was input-order user error.
- `bonus/gewinner = Portugal` + `tips/gewinner/m1 = 2:1`.
- Deleted `results/m1` (a player had entered 2:1 too early during the live match).

### Known follow-up
- Result auto-sync still relies on openfootball publishing (~daily). The opening-match real-check (`wmtipp-realcheck`) tonight verifies lock + auto-result + scoring end-to-end.

## Latest (2026-06-10 morning, per Marc via Discord)
- **Design = Marc's mockup, adopted 1:1** ("retro pitch": striped green background, cream cards with 2px ink borders + hard offset shadows, gold accents, sticky gold day ribbons, trophy header with next-kickoff/open-tips chip, WR pills per team, ENDSTAND band, system fonts). Marc rejected my first "Flutlicht" dark/neon redesign and sent a JSX mockup — its CSS system is the reference (was `wm2026-tippspiel.jsx`, design tokens now in styles.css `:root`). Functionality stayed ours.
- **German team names** in DE via `teamName()` map in i18n.js (data keys remain English). Filters: Heute/Offen/Alle/K.o./Gruppe▾ + manual 🔄 refresh ("Gespielt" removed per Marc). Kept from my pass: podium, movement arrows, confetti, Tagessieger, tipped-count (restyled).
- **PWA**: manifest + generated icons + network-first SW (`sw.js`, bump VERSION to invalidate) + install panel in Bonus tab (beforeinstallprompt / iOS hint).
- **PostHog analytics** (EU): pageviews + player/tip/result/bonus events, identify by pid, off in demo mode. **Key = old wettervergleich project** (idle, no mixing) because Marc's personal API key lacks project:write; swap key in `js/config.js` POSTHOG once Marc creates a dedicated project.
- **Demo mode** `?demo=1`: clock shifted to matchday 2 (2026-06-13), device-local sandbox (`wmtipp:demo` localStorage key), seeded players Anna/Ben (PIN 0000). For Marc to try result entry/scoring safely.
- **Stake rules**: 2 € per player, pot split 50/30/20 to top 3 (config `STAKE` in config.js), live pot display in Rangliste + Bonus rules.
- **Sync priority REVERSED per Marc**: openfootball auto-results now overwrite manual entries (source is authoritative).
- **Open commitment**: Thursday 2026-06-11 after the opening match (~23:00), run a real-system check (lock fired, auto result arrived, points correct) and report to Marc. Task `wmtipp-realcheck` on the MarcOS board.

## What this is
Family betting game for the FIFA World Cup 2026 (June 11 – July 19). Static web app, no build step. Built by Neo 2026-06-09 on Marc's Discord request, same evening from idea to live.

- **Family URL (primary):** https://wm2026.marcusbirke.de (Vercel, set up by Marc, auto-deploys from GitHub)
- **Repo:** `marcoz711/wm-tippspiel` (transferred from thebruce030 2026-06-09; thebruce030 CLI still has push access, local remote updated)
- **Secondary:** https://marcoz711.github.io/wm-tippspiel/ (GitHub Pages survived the transfer)
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
