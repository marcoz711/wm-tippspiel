// ── App configuration ──────────────────────────────────────────────
// Scoring follows Kicktipp defaults (verified against kicktipp.de):
//   exact result = 4, correct goal difference = 3, correct tendency = 2.
// Draws: exact = 4, any other correct draw tip = 3 (goal difference 0).
export const SCORING = {
  exact: 4,
  diff: 3,
  tendency: 2,
  championBonus: 10, // locked at first kickoff
};

// Entry fee per player (EUR) and pot split for the top 3.
export const STAKE = { fee: 2, split: [0.5, 0.3, 0.2] };

// Only these players see the manual "enter result" UI (a soft UI gate).
// Results otherwise come from the auto-sync (js/sync.js + the daily Action).
export const ADMIN_PIDS = ['marcus'];

// Shared key the CURRENT app + the daily sync stamp on every result write.
// The RTDB rule (database.rules.json) rejects result writes that lack it, so an
// OLD cached version of the app — which doesn't send it — can no longer save
// results. NOTE: it ships in the bundle, so it's a stale-app / accidental guard,
// not a hard secret. MUST match database.rules.json + scripts/sync-results.mjs.
export const RESULT_WRITE_KEY = 'wmtipp-rk-02fd88bd8e8f';

// Players who have paid into the pot — shown with a ✓ on the Bonus screen.
// Update as more people pay (then redeploy).
export const PAID_PIDS = ['marcus', 'oma', 'uta', 'karsten', 'cowboy', 'c-o'];

// PostHog (EU) — dedicated wm-tippspiel project (key from Marc, 2026-06-10).
export const POSTHOG = {
  key: 'phc_r2Z2mRrWGa7wz9tgCF5drafJepHT6x34Qcq9XEZcSWC9',
  host: 'https://eu.i.posthog.com',
};

// Knockout tips are scored on the result after 90 minutes (Kicktipp standard).
export const TOURNAMENT_START_UTC = '2026-06-11T19:00:00Z';

// ── Firebase ────────────────────────────────────────────────────────
// Paste the web app config from the Firebase console here and the app
// switches from device-local storage to shared realtime storage.
// Until then it runs on localStorage (single device, good for testing).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBbjhRhsD8BWcDhaasOAatQNtvAMH_Bnxk',
  authDomain: 'wm-tippspiel-2026-bf3e4.firebaseapp.com',
  databaseURL: 'https://wm-tippspiel-2026-bf3e4-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'wm-tippspiel-2026-bf3e4',
  appId: '1:392955546715:web:2369f54f95b18e467f437e',
};
