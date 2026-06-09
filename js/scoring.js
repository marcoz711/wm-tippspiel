import { SCORING } from './config.js';

// tip and result: {h, a} integers. Returns points per the Kicktipp scheme.
export function scoreTip(tip, result, scoring = SCORING) {
  if (!tip || !result || !Number.isInteger(tip.h) || !Number.isInteger(tip.a)) return 0;
  if (!Number.isInteger(result.h) || !Number.isInteger(result.a)) return 0;

  const tipTend = Math.sign(tip.h - tip.a);
  const resTend = Math.sign(result.h - result.a);
  if (tipTend !== resTend) return 0;
  if (tip.h === result.h && tip.a === result.a) return scoring.exact;
  if (tip.h - tip.a === result.h - result.a) return scoring.diff;
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
  // Tie-break: total points, then # exact results, then # goal-diff hits (Kicktipp convention).
  rows.sort((a, b) => b.points - a.points || b.exact - a.exact || b.diff - a.diff || a.name.localeCompare(b.name));
  let lastKey = null, lastRank = 0;
  rows.forEach((r, i) => {
    const key = `${r.points}|${r.exact}|${r.diff}`;
    r.rank = key === lastKey ? lastRank : (lastRank = i + 1, i + 1);
    lastKey = key;
  });
  return rows;
}
