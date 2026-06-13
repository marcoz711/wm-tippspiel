// Daily server-side result sync.
//
// Writes finished match results (+ resolved knockout pairings) into Firebase
// RTDB so the family standings update even when nobody has the app open.
// Mirrors js/sync.js:
//   - Pass 1: ESPN public scoreboard (free, no key, near real-time) for
//     same-day GROUP results, matched by team pair.
//   - Pass 2: openfootball for KO bracket resolution + KO results (90-min ft)
//     and as a group fallback. Best-effort; never blocks pass 1.
//
// Auth: anonymous sign-in via the public web apiKey — the same identity the
// browser app uses. No secrets required; the RTDB rules already allow authed
// writes. Run via .github/workflows/sync-results.yml (daily) or `node` locally.

import { readFile } from 'node:fs/promises';

const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const ESPN_RANGES = ['20260611-20260622', '20260623-20260704', '20260705-20260719'];
const API_KEY = 'AIzaSyBbjhRhsD8BWcDhaasOAatQNtvAMH_Bnxk';
const DB = 'https://wm-tippspiel-2026-bf3e4-default-rtdb.europe-west1.firebasedatabase.app';
const RESULT_WRITE_KEY = 'wmtipp-rk-02fd88bd8e8f'; // must match js/config.js + database.rules.json

// Source team names → our data/matches.json names (mirror of js/sync.js).
const ALIASES = {
  'USA': 'United States', 'Korea Republic': 'South Korea', "Côte d'Ivoire": 'Ivory Coast',
  'Czechia': 'Czech Republic', 'Türkiye': 'Turkey', 'IR Iran': 'Iran',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Congo DR': 'DR Congo', 'Cabo Verde': 'Cape Verde',
};
const norm = (n) => ALIASES[n] || n;
const pairKey = (a, b) => [a, b].sort().join('|');
const mk = (id) => `m${id}`; // bare numeric keys make Firebase coerce to arrays

async function anonToken() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}: ${await r.text()}`);
  return (await r.json()).idToken;
}

async function dbGet(path, tok) {
  const r = await fetch(`${DB}/${path}.json?auth=${tok}`);
  if (!r.ok) throw new Error(`get ${path} ${r.status}`);
  return r.json();
}
async function dbPut(path, value, tok) {
  const r = await fetch(`${DB}/${path}.json?auth=${tok}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`put ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const fixtures = JSON.parse(await readFile(new URL('../data/matches.json', import.meta.url), 'utf8'));
  const matches = fixtures.matches;
  const teams = fixtures.teams || {};
  const hasTeam = (n) => !!teams[n];
  const oursById = new Map(matches.map((m) => [m.id, m]));

  const tok = await anonToken();
  const curResults = (await dbGet('results', tok)) || {};
  const curKo = (await dbGet('koTeams', tok)) || {};

  let updated = 0;

  // ── Pass 1: ESPN — timely group results (matched by team pair). ──
  const groupByPair = new Map();
  for (const m of matches) {
    if (m.stage === 'group' && hasTeam(m.home) && hasTeam(m.away)) groupByPair.set(pairKey(m.home, m.away), m);
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
        const ours = groupByPair.get(pairKey(hn, an));
        if (!ours) continue;
        const hs = parseInt(H.score, 10), as = parseInt(A.score, 10);
        if (!Number.isInteger(hs) || !Number.isInteger(as)) continue;
        const fh = hn === ours.home ? hs : as; // align ESPN orientation to ours
        const fa = hn === ours.home ? as : hs;
        const existing = curResults[mk(ours.id)];
        if (!existing || existing.h !== fh || existing.a !== fa) {
          const fresh = { h: fh, a: fa, auto: true, k: RESULT_WRITE_KEY, espn: ev.id };
          await dbPut(`results/${mk(ours.id)}`, fresh, tok);
          curResults[mk(ours.id)] = fresh;
          updated++;
        }
      }
    } catch (e) { console.error('espn', range, String(e)); }
  }

  // ── Pass 2: openfootball — KO bracket resolution + KO results (90-min ft),
  // plus a group fallback. Best-effort; never blocks pass 1.
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
        const ms = matches.filter((m) => m.stage === stage);
        return ms.length === 1 ? ms[0] : null;
      };
      const byPair = new Map();
      for (const m of matches) if (hasTeam(m.home) && hasTeam(m.away)) byPair.set(pairKey(m.home, m.away), m);
      const resolve = (tm, t1, t2) => {
        const expStage = R2S[tm.round];
        if (expStage) {
          if (tm.num) {
            const o = oursById.get(tm.num);
            if (o && o.stage === expStage) return o;
          }
          return onlyInStage(expStage); // Third place / Final (no num)
        }
        if (t1 && t2 && hasTeam(t1) && hasTeam(t2)) return byPair.get(pairKey(t1, t2));
        return null;
      };
      for (const tm of theirMatches) {
        const t1 = norm(tm.team1?.name || tm.team1), t2 = norm(tm.team2?.name || tm.team2);
        const score = tm.score?.ft;
        const ours = resolve(tm, t1, t2);
        if (!ours) continue;

        if (ours.stage !== 'group' && hasTeam(t1) && hasTeam(t2) && !hasTeam(ours.home)) {
          const cur = curKo[mk(ours.id)];
          if (cur?.home !== t1 || cur?.away !== t2) {
            await dbPut(`koTeams/${mk(ours.id)}`, { home: t1, away: t2 }, tok);
            curKo[mk(ours.id)] = { home: t1, away: t2 };
            updated++;
          }
        }

        if (Array.isArray(score) && score.length === 2) {
          const existing = curResults[mk(ours.id)];
          const fresh = { h: score[0], a: score[1], auto: true, k: RESULT_WRITE_KEY };
          if (!existing || existing.h !== fresh.h || existing.a !== fresh.a) {
            if (ours.stage !== 'group' && fresh.h === fresh.a) {
              const et = tm.score?.et, p = tm.score?.p;
              const decider = p || et;
              if (Array.isArray(decider)) fresh.winner = decider[0] > decider[1] ? 'home' : 'away';
            }
            await dbPut(`results/${mk(ours.id)}`, fresh, tok);
            curResults[mk(ours.id)] = fresh;
            updated++;
          }
        }
      }
    }
  } catch (e) { console.error('openfootball', String(e)); }

  console.log(JSON.stringify({ updated }));
}

main().catch((e) => { console.error(e); process.exit(1); });
