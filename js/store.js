import { FIREBASE_CONFIG } from './config.js';

// Shared data tree (same shape locally and in Firebase RTDB):
// players/{pid} = {name, emoji}
// tips/{pid}/{matchId} = {h, a}
// results/{matchId} = {h, a, winner?}   winner: 'home'|'away' for KO draws (pens)
// bonus/{pid} = {champion}
// koTeams/{matchId} = {home, away}      real teams for knockout matches once known

const LS_KEY = 'wmtipp:db';

class LocalStore {
  constructor() {
    this.data = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    this.listeners = [];
    // Pick up writes from other tabs on the same device.
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY) {
        this.data = JSON.parse(e.newValue || '{}');
        this._emit();
      }
    });
  }
  async init() { return this; }
  onData(cb) { this.listeners.push(cb); cb(this.data); }
  _emit() { for (const cb of this.listeners) cb(this.data); }
  _persist() { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); this._emit(); }
  async set(path, value) {
    const parts = path.split('/');
    let node = this.data;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    const last = parts[parts.length - 1];
    if (value === null) delete node[last]; else node[last] = value;
    this._persist();
  }
}

class FirebaseStore {
  async init() {
    const V = '12.14.0';
    const [{ initializeApp }, { getAuth, signInAnonymously }, dbMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
    ]);
    this.fb = dbMod;
    const app = initializeApp(FIREBASE_CONFIG);
    await signInAnonymously(getAuth(app));
    this.db = dbMod.getDatabase(app);
    return this;
  }
  onData(cb) {
    this.fb.onValue(this.fb.ref(this.db, '/'), (snap) => cb(snap.val() || {}));
  }
  async set(path, value) {
    await this.fb.set(this.fb.ref(this.db, path), value);
  }
}

export async function createStore() {
  const store = FIREBASE_CONFIG ? new FirebaseStore() : new LocalStore();
  await store.init();
  return store;
}

// Match-id keys are prefixed ("m7") — bare numeric keys make Firebase
// coerce the node into a sparse array.
export const mk = (id) => `m${id}`;

export const api = {
  setPlayer: (s, pid, player) => s.set(`players/${pid}`, player),
  setTip: (s, pid, matchId, tip) => s.set(`tips/${pid}/${mk(matchId)}`, tip),
  setResult: (s, matchId, result) => s.set(`results/${mk(matchId)}`, result),
  setBonus: (s, pid, bonus) => s.set(`bonus/${pid}`, bonus),
  setKoTeams: (s, matchId, teams) => s.set(`koTeams/${mk(matchId)}`, teams),
};
