import { api, mk } from './store.js';

// Auto-fills results (and knockout pairings) from the openfootball
// community dataset: public domain, no API key, CORS-open, updated
// roughly once a day during the tournament. The source is authoritative:
// it overwrites manual entries when they differ (per Marc, 2026-06-10).
const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const ALIASES = {
  'USA': 'United States', 'Korea Republic': 'South Korea', "Côte d'Ivoire": 'Ivory Coast',
  'Czechia': 'Czech Republic', 'Türkiye': 'Turkey', 'IR Iran': 'Iran',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Congo DR': 'DR Congo', 'Cabo Verde': 'Cape Verde',
};
const norm = (n) => ALIASES[n] || n;
const pairKey = (a, b) => [a, b].sort().join('|');

// ESPN public scoreboard — free, no key, near real-time. Primary source for
// same-day results (openfootball lags ~a day). Chunked to stay under ESPN's
// ~100-events-per-response cap. Grouped by US local date, like our fixtures.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const ESPN_RANGES = ['20260611-20260622', '20260623-20260704', '20260705-20260719'];

export async function syncResults(state, store) {
  let updated = 0;
  const oursById = new Map(state.matches.map((m) => [m.id, m]));

  // ── Pass 1: ESPN — timely results (group + decisive knockout), by team pair. ──
  // pair -> { id, home } where home is the real home-team name we align ESPN to.
  const espnByPair = new Map();
  for (const m of state.matches) {
    if (m.stage === 'group' && state.teams[m.home] && state.teams[m.away]) {
      espnByPair.set(pairKey(m.home, m.away), { id: m.id, home: m.home, ko: false });
    }
  }
  // Knockout teams are only known once the bracket resolves (koTeams). Take a
  // DECISIVE result from ESPN too, so a finished KO game evaluates without waiting
  // for openfootball (which lags ~a day). A draw likely went to ET/pens -> leave it
  // to pass 2, which carries the winner + shootout score.
  for (const [k, v] of Object.entries(state.db.koTeams || {})) {
    const id = parseInt(k.slice(1), 10);
    if (v?.home && v?.away && oursById.has(id)) espnByPair.set(pairKey(v.home, v.away), { id, home: v.home, ko: true });
  }
  for (const range of ESPN_RANGES) {
    try {
      const r = await fetch(`${ESPN}?dates=${range}`);
      if (!r.ok) continue;
      const data = await r.json();
      for (const ev of (data.events || [])) {
        if (ev.status?.type?.name !== 'STATUS_FULL_TIME') continue;
        const c = ev.competitions?.[0]; if (!c) continue;
        const H = (c.competitors || []).find((x) => x.homeAway === 'home');
        const A = (c.competitors || []).find((x) => x.homeAway === 'away');
        if (!H || !A) continue;
        const hn = norm(H.team?.displayName || H.team?.name);
        const an = norm(A.team?.displayName || A.team?.name);
        const tgt = espnByPair.get(pairKey(hn, an));
        if (!tgt) continue;
        const hs = parseInt(H.score, 10), as = parseInt(A.score, 10);
        if (!Number.isInteger(hs) || !Number.isInteger(as)) continue;
        const fh = hn === tgt.home ? hs : as; // align ESPN orientation to ours (by name)
        const fa = hn === tgt.home ? as : hs;
        if (tgt.ko && fh === fa) continue; // KO draw -> ET/pens, resolved by openfootball
        const existing = state.db.results?.[mk(tgt.id)];
        if (!existing || existing.h !== fh || existing.a !== fa) {
          await api.setResult(store, tgt.id, { h: fh, a: fa, auto: true, espn: ev.id });
          updated++;
        }
      }
    } catch { /* try next range, then openfootball */ }
  }

  // ── Pass 2: openfootball — KO bracket resolution + KO results (90-min ft),
  // plus a group fallback. Best-effort; never blocks pass 1. ──
  // Knockout: openfootball ships a reliable `num` for R32..SF that equals our
  // match id (validated against stage). Third place + Final carry no num, but
  // each is the only match in its stage, so they map by round.
  try {
    const res = await fetch(SRC, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const theirMatches = (data.matches || data.rounds?.flatMap((r) => r.matches) || []);
      const R2S = {
        'Round of 32': 'r32', 'Round of 16': 'r16', 'Quarter-final': 'qf',
        'Semi-final': 'sf', 'Match for third place': 'third', 'Final': 'final',
      };
      const onlyInStage = (stage) => {
        const ms = state.matches.filter((m) => m.stage === stage);
        return ms.length === 1 ? ms[0] : null;
      };
      const byPair = new Map();
      for (const m of state.matches) {
        if (state.teams[m.home] && state.teams[m.away]) byPair.set(pairKey(m.home, m.away), m);
      }
      const resolve = (tm, t1, t2) => {
        const expStage = R2S[tm.round];
        if (expStage) {
          if (tm.num) {
            const o = oursById.get(tm.num);
            if (o && o.stage === expStage) return o;
          }
          return onlyInStage(expStage); // Third place / Final (no num)
        }
        if (t1 && t2 && state.teams[t1] && state.teams[t2]) return byPair.get(pairKey(t1, t2));
        return null;
      };
      for (const tm of theirMatches) {
        const t1 = norm(tm.team1?.name || tm.team1), t2 = norm(tm.team2?.name || tm.team2);
        const score = tm.score?.ft;
        const ours = resolve(tm, t1, t2);
        if (!ours) continue;

        if (ours.stage !== 'group' && state.teams[t1] && state.teams[t2] && !state.teams[ours.home]) {
          const cur = state.db.koTeams?.[mk(ours.id)];
          if (cur?.home !== t1 || cur?.away !== t2) {
            await api.setKoTeams(store, ours.id, { home: t1, away: t2 });
            updated++;
          }
        }

        if (Array.isArray(score) && score.length === 2) {
          const existing = state.db.results?.[mk(ours.id)];
          const fresh = { h: score[0], a: score[1], auto: true };
          const koDraw = ours.stage !== 'group' && fresh.h === fresh.a;
          if (koDraw) {
            const et = tm.score?.et, p = tm.score?.p;
            const decider = p || et;
            if (Array.isArray(decider)) fresh.winner = decider[0] > decider[1] ? 'home' : 'away';
            if (Array.isArray(p) && p.length === 2) fresh.pens = { h: p[0], a: p[1] };
          }
          // Re-write a KO draw that was stored before winner/pens existed.
          const stale = koDraw && (existing?.winner == null || (fresh.pens && existing?.pens == null));
          if (!existing || existing.h !== fresh.h || existing.a !== fresh.a || stale) {
            await api.setResult(store, ours.id, fresh);
            updated++;
          }
        }
      }
    }
  } catch { /* openfootball optional */ }

  return { updated };
}
