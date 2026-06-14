# STATUS — WM-Tippspiel 2026

**Updated:** 2026-06-14 (Berlin) — **LIVE & VERIFIED** ✅

## 2026-06-14 — iOS PWA fixes + bonus + filter + reload button + auto-update (Neo, per Marc)
- **Auto-update** (`0307624`): on load the app baselines the live deploy's `index.html` ETag (verified GH Pages returns a stable content-based ETag); on every `visibilitychange→visible` (app refocus) it re-checks via a `HEAD index.html?cb=` no-store fetch — if the ETag changed, a new version shipped, so it runs `hardReset()` (unregister SW + clear caches + reload). Loop-guarded (`_resetting` + re-baseline). No manual version bump needed. Refactored the reload-button handler to share `hardReset()`. **Limitation:** only protects devices already running this code; anyone still on the OLD cache-first SW must clear site data once first (iOS won't auto-update a standalone PWA's SW), then they're permanently self-updating.

- **In-header 🔄 "Reload app" button** (`090338a`): for installed Home Screen apps (no address bar / pull-to-refresh). One tap unregisters any service worker, deletes all caches, and `location.reload()`s — fresh from network. `#reload-btn` in `.header-actions`, handler bound once near lang/player chips.

- **Replaced the "Offen"/"Open" match filter chip with "Gestern"/"Yesterday"** (`7dae1e5`). New filter shows matches whose tournament day (TOURN_TZ) == yesterday. i18n key `filterYesterday` added DE+EN; `filterOpen` left in i18n (unused, harmless). Edge: a rest-day yesterday shows empty (literal "yesterday").

- **Removed the green paid-player ✓ badges** from the Bonus tab champion list (`renderBonus`, `d3dc593`). `.paid-badge` CSS + `PAID_PIDS` import left in place (unused, harmless).

- **Header clipped by iOS status bar** when installed as a Home Screen app (standalone). `.app-header` + `.header-actions` now add `env(safe-area-inset-top)` so the trophy/flag controls clear the status bar. (`a536e7b`)
- **Tagessieger labeled with wrong day.** `dayWinner()` (and `ranksAtDayStart()`) were still grouping by `berlinDayKey` while the rest of the app moved to US host-country day (`tournDayKey`, commit `9bb6ba4`). An overnight US match (US evening = early Berlin morning) got bucketed into the next Berlin day, so the daily winner showed "today" when it was the prior matchday. Now both use `tournDayKey`/`tournFmtDate`. NOTE: this is the gap behind STATUS's earlier "v3 already had LA-day grouping" claim — the match-list grouping had it; dayWinner did not. Kickoff *times* still render in Berlin. (`a536e7b`)

## 2026-06-13 — Cert fixed + killed the stale-version problem (Mac session, Neo)
Family still saw the OLD app (could enter results; night-game dates wrong) while Marc saw the current one. Root cause + fixes:
- **GitHub Pages never provisioned the TLS cert for the custom domain** after the Vercel→Pages move — every edge node served the generic `*.github.io` cert, so https failed on family devices and the cache-first SW just kept serving the old cached app (and could never fetch new code). Marc re-added the custom domain in Settings→Pages → cert provisioned, Enforce HTTPS on. **This was the actual blocker** — the v3 code already had both bug-fixes (LA-day grouping for 3am kickoffs, admin-only result UI).
- **Replaced cache-first SW with a self-destroying one** (`sw.js`, `b425e88`): clears all caches, unregisters, reloads open tabs. On GitHub Pages there's no edge-request quota, so cache-first only pinned devices to stale code + forced VERSION bumps. `app.js` no longer registers a SW and clears any leftover. Site now runs with **no service worker** → every deploy reaches everyone on next load. Trade-off: no offline/PWA-install (fine for a live Firebase-backed game).
- **Server-side result lock** (`b425e88` + RTDB rules deployed): the admin UI gate was UI-only — a stale app still wrote results to the shared DB. Now `results/$matchId` `.write` requires a `k` write-key (`wmtipp-rk-02fd88bd8e8f`) that the current app (`config.js`→`store.js`) + cron (`sync-results.mjs`) stamp on every write. **Verified live:** anon keyless write → `401 Permission denied`; keyed write → `200`. Limitation: key ships in the bundle (stops stale-app/accidental writes, not a determined inspector). `koTeams`/`tips`/`bonus` rules unchanged. **If the key ever changes it must change in all three places at once.**
- Toolchain: this Mac is now a full deploy box — `gh` (marcoz711) + `firebase-cli` (marcpage711@gmail.com) via Homebrew; repo at `~/Projects/wm-tippspiel`. Deploy code = `git push` (→ Pages); deploy rules = `firebase deploy --only database`.

### Results audit + match-report links (2026-06-13, per Marc)
- **Audited every stored result against ESPN — all correct**, no accidental/wrong entries: m1 Mexico 2:0 South Africa, m2 South Korea 2:1 Czechia, m3 Canada 1:1 Bosnia & Herzegovina, m4 USA 4:1 Paraguay (all ESPN full-time). Audit = `results` joined to the ESPN scoreboard by team pair; rerun anytime.
- **Match-report links on finished games** (`79de62c`): results now carry `espn` (the ESPN gameId), stamped by the in-app sync (`js/sync.js`) and the daily cron (`scripts/sync-results.mjs`). The match card shows a "Spielbericht / Match report" link → `espn.com/soccer/match/_/gameId/<id>` (goals + timeline). Existing m1–m4 backfilled with their gameIds via `firebase database:update` (admin, bypasses the write-key rule). KO games come from openfootball (no ESPN id) → no link yet; group stage covered.

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

## 2026-06-12 (overnight, after opener)
- **Results source switched to ESPN** (`4866532`): openfootball lagged ~a day (opener + match 2 were final for hours but still `score:null` in openfootball), so the sync/admin-button showed "0 updated". Now `js/sync.js` + `scripts/sync-results.mjs` use a two-pass design: **Pass 1 ESPN** (`site.api.espn.com/.../fifa.world/scoreboard?dates=YYYYMMDD-…`, free/no-key, near real-time) for group results matched by team pair + orientation alignment; **Pass 2 openfootball** for KO bracket resolution (num→id) + 90-min KO results + group fallback, best-effort. ESPN team names normalized via the same ALIASES (Czechia→Czech Republic etc.). Verified Mexico 2:0 / South Korea 2:1 resolve correctly.
- Manually wrote results m1 (Mexico 2:0 South Africa) and m2 (South Korea 2:1 Czechia) via REST while openfootball was stale; ESPN sync is idempotent over them.
- More live tip overrides per Marc (all flagged, match in progress): vera/gewinner m2 1:1; Juli m2 2:1 (SK), Palme m2 1:2 (Czech). PAID_PIDS extended: +cowboy, +c-o.
- UI: podium top-3 names made legible (white + ink outline); match card now labels "DEIN TIPP" over the tip boxes + bold dark ENDSTAND pill for the result; live matches auto-expand all tips; matches grouped by US host-day so night kickoffs sit with the right evening.

### Known follow-up
- KO results via openfootball (90-min) are still ~daily-lagged; before the KO stage (~June 28) consider sourcing KO 90-min scores from ESPN too (needs the regulation-time score, not post-ET). The opening-match real-check (`wmtipp-realcheck`) covers group-stage end-to-end.

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
