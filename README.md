# WM-Tippspiel 2026 🏆

Family betting game for the FIFA World Cup 2026. Static web app, no build step.

## How it works

- Everyone opens the same URL on their own device, picks their name (+ PIN), and tips each match before kickoff.
- Scoring (Kicktipp standard): exact result **4**, correct goal difference **3**, correct tendency **2**. Knockout matches count after 90 minutes. Bonus tip "World Champion" = **10** points, locked at the opening match.
- Tips are hidden until kickoff, then everyone sees everyone's tips per match.
- Leaderboard tie-break: total points → most exact results → most goal-difference hits.

## Run locally

```sh
python -m http.server 8123
# open http://localhost:8123
```

## Persistence

Without configuration the app stores everything in `localStorage` (single device — testing only).

For the family (multi-device) it uses **Firebase Realtime Database** (free Spark plan, no credit card):

1. [console.firebase.google.com](https://console.firebase.google.com) → Add project (no Analytics needed)
2. Build → **Realtime Database** → Create (europe-west1) → start in locked mode
3. Build → **Authentication** → Sign-in method → enable **Anonymous**
4. Project settings → Add web app → copy the `firebaseConfig` object into `js/config.js` (`FIREBASE_CONFIG`)
5. Realtime Database → Rules → paste:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## Data files

- `data/matches.json` — all 104 fixtures (verified June 2026)
- `data/teams-info.json` — FIFA ranking + Opta title probabilities (Favoriten tab)
- `data/matches.sample.json` — tiny fallback for development
