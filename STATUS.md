# STATUS — WM-Tippspiel 2026

**Updated:** 2026-06-30 (Berlin) — **LIVE & VERIFIED** ✅

## 2026-07-01 (18:00) — Live tips m80 (Neo, per Marc via Discord)
- England–DR Congo (m80, England home): `--palme--` 3:1, `--juli------` 4:0 ("Julia" = Juli). Both clean adds, written ~9 min BEFORE kickoff (18:00 Berlin). Read back to verify.

## 2026-07-01 — KO results from ESPN + last-card scroll clearance (Neo, per Marc screenshots)
- **Bug A (functional):** a finished KO game (m79 Mexico–Ecuador) showed as not evaluated. Root cause: the ESPN pass (near real-time) only matched `stage === 'group'`; ALL knockout results depended on openfootball, which lags ~a day. ESPN already had `Mexico 2:0 Ecuador STATUS_FULL_TIME` while openfootball still had it `null`.
  - Fix (`ab32772`): pass 1 in both `js/sync.js` + `scripts/sync-results.mjs` now also maps resolved KO pairings (`koTeams`) and writes a **decisive** ESPN result for them; a draw is left to openfootball pass 2 (winner + pens). Orientation aligned by team name (robust to ESPN/openfootball home-away disagreement). Verified vs live ESPN: m73/m76/m77/m78/m79 align with stored values, pen draws m74/m75 correctly skipped. m79 also backfilled directly in Firebase (2:0).
- **Bug B (layout):** couldn't scroll the last match card clear of the fixed tab bar. `.view` bottom padding under-counted the tab-bar height (missing `env(safe-area-inset-bottom)`). Added it to the clearance calc.
- Marc's two 07:00 screenshots did NOT flag the top status-bar overlap again (the mask from `d38a321` seems fine); the tab-bar-mid-screen was again a full-page-screenshot artifact.

## 2026-06-30 (abends) — Status-bar overlap fix (Neo, per Marc screenshot)
- **Bug:** in the Rangliste, the top row (leader / `.me` cream highlight) was clipped behind the iOS clock once scrolled. Standalone PWA runs full-screen under the black-translucent status bar (`viewport-fit=cover`); `.app-header` carries `env(safe-area-inset-top)` but isn't sticky, so scrolling slides `#view` content under the status bar.
- **Fix (`d38a321`, CSS only):** fixed `body::before` over the top inset, painted with the same pitch stripe gradient as the body → seamless at rest, masks scrolled content. Height 0 / invisible where no inset (desktop/Android). The tab bar floating mid-screen in Marc's screenshot was a full-page-screenshot artifact, not a bug (it's `position:fixed; bottom:0`).

## 2026-06-30 — Penalty-shootout results: shootout score = result, group rules (Neo, per Marc via Discord)
- **Bug:** KO games decided on penalties showed as plain draws (`1:1`) and scored 0 for everyone. The sync stored a `winner` field on penalty draws (m74 Germany–Paraguay, m75 Netherlands–Morocco) but `scoring.js` + the result band ignored it.
- **Final rule (per Marc, after a first wrong attempt):** a penalty game uses the **same rules as the group stage**, with the **penalty shootout score as the final result** (e.g. Germany 1:1 Paraguay, 3:4 on pens → result `3:4`, scored normally exact/diff/tendency). My first attempt (`46312ba`) used a special "tendency-only (2 pts) for the winner" rule — Marc rejected it ("gleiche Regeln wie zur Vorrunde"). Superseded by `0b00574`.
- **Implementation (`0b00574`, client-side + data backfill):**
  - `scoreTip()`: scores the tip against `result.pens {h,a}` when present, with the normal scheme; no KO special case.
  - Result band: headlines the shootout score (`ENDSTAND 3 : 4`), keeps regular-time score as a small `n.E. · 1:1` note. i18n `afterPens` (DE `n.E.` / EN `pens`), `.pen-note` CSS.
  - `sync.js` + `sync-results.mjs`: now store `pens {h,a}` from the source `p[]` array (winner kept for champion resolution), and re-write KO draws stored before winner/pens existed.
  - Data model: `results/{id} = {h,a,winner?,pens?}` — h/a = regular-time score, pens = shootout tally (the scored + shown result).
  - Penalty orientation verified vs openfootball: m74 `p:[3,4]` Paraguay, m75 `p:[2,3]` Morocco. m74/m75 backfilled with `pens` in Firebase.
- **Net effect:** Karsten **+3** on m74 (tipped Paraguay 5:6, matched the 1-goal margin of 3:4); everyone else 0 on both (all backed the favourite that lost). Family must reload (🔄 / pull-to-refresh) for the new bundle.

## 2026-06-28 — Auto-scroll, KO no-draw rule, Saturday tips (Neo, per Marc via Discord)
- **"Alle" auto-scrolls to today** (`a6f243a`): tapping the "Alle" filter now jumps the match list straight to the current tournament day instead of the top. `renderMatches()` tags the current day's `date-header` with `id="day-anchor"` (today if it has matches, else next upcoming day, else last day); the `data-filter` click handler `scrollIntoView`s it. Grouped by tournDayKey (LA). Syntax-checked.
- **Knockout phase forbids draw tips + penalty warning** (`f25f7f8`): for `stage != 'group'`, `saveTipFromInputs()` rejects a drawn tip (`h === a`) with a toast (`koNoDraw`) and does not save; each unlocked KO card shows a yellow hint (`koHint`) that a winner is required and a level game may go to a penalty shootout. New i18n keys DE+EN; `.ko-hint` CSS. Group games unchanged (draws still allowed). Verified: keys resolve both langs, logic blocks only KO draws. **Note:** pre-existing KO draw tips (if any) stay until re-tipped — not migrated.
- **Saturday tips entered from a photo** (`tips/<pid>/m67–m72`): Marc printed the tip sheet (PDF generated this session, landscape + world ranks), 4 family members filled it by hand, sent a photo. Read the handwriting, mapped columns to real players (col 1=`--juli------`, 2=`--palme--`, 3=`vera`, 4=`gewinner`), confirmed none had prior tips for m67–m72 (all clean adds), wrote 24 tips via `firebase database:update` and read them back to verify. Games already played → admin override past the lock (intended). Match day = the app's Saturday (LA): m67 Panama-England, m68 Croatia-Ghana, m71 Colombia-Portugal, m72 DR Congo-Uzbekistan, m69 Algeria-Austria, m70 Jordan-Argentina.
- **m73 R32 live tips (evening, per Marc via Discord)**: South Africa (home) vs Canada (away), kickoff 28.06. 21:00 — all entered BEFORE kickoff, all clean adds, read back to verify. Juli `0:2` + Palme `1:2` (Marc phrased these "für Kanada" → Canada is away, so 2:0/2:1 for Canada = 0:2/1:2 home:away). Uta `1:3`, Oma `2:4`, Vera `2:0`, Gewinner `3:1` (given as bare scores → stored direct home:away). **Note:** PowerShell mangles `firebase database:set -d '{json}'` (HTTP 400 invalid JSON) — must write the JSON to a file and pass it as the infile arg.
- **Cleared legacy KO draw tips**: scanned all players for draw tips on KO matches (m73–m104) — 7 found (6 were Marc's own, since corrected; 1 was Juli m104 Final 0:0). Deleted Juli's per Marc; re-scan confirms 0 KO draws remain.

## 2026-06-23 — Live tips, m47 (Neo, per Marc via Discord voice note)
- Voice note (transcribed locally, deleted after): Vera + Palme forgot to tip again; scores given but no match/team named. All of today's 3 upcoming games were untipped by both, so confirmed match+orientation with Marc before writing (he said "Ja"). Wrote to `tips/<pid>/m47` (Portugal home): **`--palme--` → 2:1**, **`vera` → 3:1**. Both clean adds. Entered ~7 min after the 19:00 kickoff (admin override past the lock).

## 2026-06-22 — Pull-to-refresh + live tips (Neo, per Marc via Discord)
- **Pull-to-refresh** added for the standalone PWA (no browser address-bar refresh in installed mode). New module `js/pull-to-refresh.js`: pulling down at the top of the page (`window.scrollY <= 0`) past a 70px threshold runs `hardReset()` — the same SW-unregister + cache-clear + reload as the 🔄 button. Damped travel (`dy^0.85`), gold pill indicator that fades/rotates in, spins while refreshing, snaps back below threshold, 4s fallback. Wired in `main()` via `initPullToRefresh(hardReset)`; CSS `#ptr-indicator` in `styles.css`. Syntax-checked (`node --check`); **touch gesture itself to be verified by Marc on device, not in this session.**
- **Tips entered via REST anon-auth** (`tips/<pid>/<mXX>`), all clean adds (no prior tips, nothing overwritten):
  - `vera` + `gewinner` → **m43 Argentina 2:1 Austria** ({h:2,a:1}). **Flagged:** entered ~15 min AFTER kickoff (19:00 Berlin) — admin override past the lock.
  - `--juli------` → **m42 France 4:1 Iraq**, **m41 Norway 1:2 Senegal**, **m44 Jordan 1:2 Algeria** (all BEFORE kickoff).
  - `--palme--` → **m42 France 3:1 Iraq**, **m41 Norway 1:1 Senegal**, **m44 Jordan 1:1 Algeria** (all BEFORE kickoff). Marc wrote "bor Senegal" → read as Norway (only Senegal group match), confirmed in the reply.

## 2026-06-15 — Live tip overrides, match 14 (Neo, per Marc via Discord)
- Per Marc, added tips for **m14 Spain 6:0 Cape Verde** ({h:6,a:0}) for `vera` and `gewinner` via REST anon-auth (`tips/<pid>/m14`). Both had no prior m14 tip (clean adds, nothing overwritten). **Flagged:** entered ~1h AFTER kickoff (18:00 Berlin) — admin override past the lock, consistent with the matchday-1/2 live overrides; no result in DB yet at write time. Confirmed orientation with Marc (Spain is home → 6:0).
- Then added Vera's tips for the other 3 of today's games (all BEFORE kickoff, clean, no prior tips): **m16 Belgium 3:1 Egypt** ({h:3,a:1}), **m13 Saudi Arabia 0:1 Uruguay** ({h:0,a:1}), **m15 Iran 2:0 New Zealand** ({h:2,a:0}). Orientation matched Marc's home:away order verbatim.

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
