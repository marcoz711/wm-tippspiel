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

// Knockout tips are scored on the result after 90 minutes (Kicktipp standard).
export const TOURNAMENT_START_UTC = '2026-06-11T19:00:00Z';

// ── Firebase ────────────────────────────────────────────────────────
// Paste the web app config from the Firebase console here and the app
// switches from device-local storage to shared realtime storage.
// Until then it runs on localStorage (single device, good for testing).
export const FIREBASE_CONFIG = null;
/* Example:
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "wm-tippspiel-xxxx.firebaseapp.com",
  databaseURL: "https://wm-tippspiel-xxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "wm-tippspiel-xxxx",
};
*/
