import { SCORING } from './config.js';

// tip and result: {h, a} integers. Returns points per the Kicktipp scheme.
export function scoreTip(tip, result, scoring = SCORING) {
  if (!tip || !result || !Number.isInteger(tip.h) || !Number.isInteger(tip.a)) return 0;

  // Penalty-decided knockout game: the shootout score IS the final result and is
  // scored by the exact same rules as every other match (Marc, 2026-06-30).
  // `pens` {h,a} holds the shootout tally; the regular 1:1 stays in result.h/a.
  const r = (result.pens && Number.isInteger(result.pens.h) && Number.isInteger(result.pens.a))
    ? result.pens : result;
  if (!Number.isInteger(r.h) || !Number.isInteger(r.a)) return 0;

  const tipTend = Math.sign(tip.h - tip.a);
  const resTend = Math.sign(r.h - r.a);
  if (tipTend !== resTend) return 0;
  if (tip.h === r.h && tip.a === r.a) return scoring.exact;
  if (tip.h - tip.a === r.h - r.a) return scoring.diff;
  return scoring.tendency;
}

export function tendencyLabel(tip) {
  if (!tip) return null;
  const t = Math.sign(tip.h - tip.a);
  return t > 0 ? '1' : t < 0 ? '2' : 'X';
}

// Aggregates the leaderboard. players: {id: {name, emoji}}, tips: {playerId: {matchId: {h,a}}},
// results: {matchId: {h,a}}, bonus: {playerId: {champion}}, championResult: string|null
export function computeStandings({ players, tips, results, bonus, championResult, scoring = SCORING }) {
  const rows = Object.entries(players || {}).map(([pid, p]) => {
    let points = 0, exact = 0, diffN = 0, tend = 0, tipped = 0;
    const playerTips = (tips || {})[pid] || {};
    for (const [matchId, result] of Object.entries(results || {})) {
      if (!result || result.h == null) continue;
      const tip = playerTips[matchId];
      if (!tip) continue;
      tipped++;
      const pts = scoreTip(tip, result, scoring);
      points += pts;
      if (pts === scoring.exact) exact++;
      else if (pts === scoring.diff) diffN++;
      else if (pts === scoring.tendency) tend++;
    }
    let bonusPts = 0;
    const pick = (bonus || {})[pid]?.champion;
    if (championResult && pick === championResult) bonusPts = scoring.championBonus;
    return { pid, name: p.name, emoji: p.emoji || '⚽', points: points + bonusPts, matchPoints: points, bonusPts, exact, diff: diffN, tend, tipped };
  });
  // Display order tie-break: total points, then # exact results, then # goal-diff hits
  // (Kicktipp convention) — this only orders rows within equal points, it does NOT split rank.
  rows.sort((a, b) => b.points - a.points || b.exact - a.exact || b.diff - a.diff || a.name.localeCompare(b.name));
  // Rank by POINTS ONLY: equal points share a rank, the next rank skips (standard
  // competition ranking, e.g. 1, 2, 2, 4). Tie-breakers above decide listing order, not rank.
  let lastKey = null, lastRank = 0;
  rows.forEach((r, i) => {
    const key = `${r.points}`;
    r.rank = key === lastKey ? lastRank : (lastRank = i + 1, i + 1);
    lastKey = key;
  });
  return rows;
}
