// Daily server-side result sync.
//
// Pulls the openfootball worldcup.json dataset and writes finished match
// results (+ resolved knockout pairings) into Firebase RTDB, so the family
// standings update even when nobody has the app open. This mirrors the
// client-side logic in js/sync.js exactly; it's a reliability backstop, the
// in-app 6-hourly sync still runs too.
//
// Auth: anonymous sign-in via the public web apiKey — the same identity the
// browser app uses. No secrets required; the RTDB rules already allow authed
// writes. Run via .github/workflows/sync-results.yml (daily) or `node` locally.

import { readFile } from 'node:fs/promises';

const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const API_KEY = 'AIzaSyBbjhRhsD8BWcDhaasOAatQNtvAMH_Bnxk';
const DB = 'https://wm-tippspiel-2026-bf3e4-default-rtdb.europe-west1.firebasedatabase.app';

// openfootball team names → our data/matches.json names (mirror of js/sync.js).
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

  const res = await fetch(SRC, { cache: 'no-store' });
  if (!res.ok) { console.log(`source fetch ${res.status} — nothing to do`); return; }
  const data = await res.json();
  const theirMatches = (data.matches || data.rounds?.flatMap((r) => r.matches) || []);
  if (!theirMatches.length) { console.log('no matches in source — nothing to do'); return; }

  const tok = await anonToken();
  const curResults = (await dbGet('results', tok)) || {};
  const curKo = (await dbGet('koTeams', tok)) || {};

  // Verify openfootball's match numbering equals the official FIFA numbering
  // by checking team pairs of group matches we already know.
  const oursById = new Map(matches.map((m) => [m.id, m]));
  let numChecked = 0, numAgree = 0;
  for (const tm of theirMatches) {
    const t1 = norm(tm.team1?.name || tm.team1), t2 = norm(tm.team2?.name || tm.team2);
    if (!tm.num || !t1 || !t2 || !hasTeam(t1) || !hasTeam(t2)) continue;
    const ours = oursById.get(tm.num);
    if (!ours || !hasTeam(ours.home)) continue;
    numChecked++;
    if (pairKey(ours.home, ours.away) === pairKey(t1, t2)) numAgree++;
  }
  const trustNum = numChecked >= 10 && numAgree / numChecked > 0.95;

  const byPair = new Map();
  for (const m of matches) if (hasTeam(m.home) && hasTeam(m.away)) byPair.set(pairKey(m.home, m.away), m);

  let updated = 0;
  for (const tm of theirMatches) {
    const t1 = norm(tm.team1?.name || tm.team1), t2 = norm(tm.team2?.name || tm.team2);
    const score = tm.score?.ft;
    let ours = trustNum && tm.num ? oursById.get(tm.num) : null;
    if (!ours && t1 && t2 && hasTeam(t1) && hasTeam(t2)) ours = byPair.get(pairKey(t1, t2));
    if (!ours) continue;

    // Resolve knockout placeholders once the real teams are known.
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
      const fresh = { h: score[0], a: score[1], auto: true };
      if (!existing || existing.h !== fresh.h || existing.a !== fresh.a) {
        if (ours.stage !== 'group' && fresh.h === fresh.a) {
          // 90-min draw in a KO match: take the advancing team from ET/pens.
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
  console.log(JSON.stringify({ updated, trustNum, numChecked }));
}

main().catch((e) => { console.error(e); process.exit(1); });
