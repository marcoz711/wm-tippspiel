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

export async function syncResults(state, store) {
  let data;
  try {
    const res = await fetch(SRC, { cache: 'no-store' });
    if (!res.ok) return { updated: 0, reason: `fetch ${res.status}` };
    data = await res.json();
  } catch (e) { return { updated: 0, reason: String(e) }; }

  const theirMatches = (data.matches || data.rounds?.flatMap((r) => r.matches) || []);
  if (!theirMatches.length) return { updated: 0, reason: 'no matches in source' };

  // Match openfootball entries to our fixtures.
  // - Knockout: openfootball ships a reliable `num` for R32..SF that equals
  //   our match id (validated against stage). Third place + Final carry no
  //   num, but each is the only match in its stage, so they map by round.
  // - Group: openfootball has no `num` for group games — match by team pair.
  const oursById = new Map(state.matches.map((m) => [m.id, m]));
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

  let updated = 0;
  for (const tm of theirMatches) {
    const t1 = norm(tm.team1?.name || tm.team1), t2 = norm(tm.team2?.name || tm.team2);
    const score = tm.score?.ft;
    const ours = resolve(tm, t1, t2);
    if (!ours) continue;

    // Resolve knockout placeholders once real teams are known.
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
      if (!existing || existing.h !== fresh.h || existing.a !== fresh.a) {
        if (ours.stage !== 'group' && fresh.h === fresh.a) {
          // 90-min draw in a KO match: take the advancing team from ET/pens if present.
          const et = tm.score?.et, p = tm.score?.p;
          const decider = p || et;
          if (Array.isArray(decider)) fresh.winner = decider[0] > decider[1] ? 'home' : 'away';
        }
        await api.setResult(store, ours.id, fresh);
        updated++;
      }
    }
  }
  return { updated };
}
