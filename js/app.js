import { createStore, api, mk } from './store.js';
import { syncResults } from './sync.js';
import { confetti } from './confetti.js';
import { initAnalytics, track, identify } from './analytics.js';
import { scoreTip, computeStandings } from './scoring.js';
import { t, getLang, setLang, teamName } from './i18n.js';
import { SCORING, STAKE, TOURNAMENT_START_UTC, ADMIN_PIDS, PAID_PIDS } from './config.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EMOJIS = ['⚽', '🦁', '🦅', '🐺', '🦊', '🐻', '🐯', '🦄', '🐸', '🐙', '🦖', '🐬', '🦜', '🐢', '🚀', '🔥', '⭐', '🍀', '👑', '🎯', '🥨', '🍕', '🧙', '🤖'];

// Demo mode (?demo=1): device-local sandbox, clock shifted to matchday 2
// so result entry, points, and leaderboard can be tried before kickoff.
const DEMO = new URLSearchParams(location.search).has('demo');
const BOOT_REAL = Date.now();
const DEMO_NOW = new Date('2026-06-13T09:00:00Z').getTime();
const now = () => (DEMO ? DEMO_NOW + (Date.now() - BOOT_REAL) : Date.now());

const state = {
  store: null,
  db: {},
  matches: [],
  groups: {},
  teams: {},
  teamsInfo: null,
  tab: 'matches',
  filter: 'today',
  teamsView: 'groups',
  pid: localStorage.getItem('wmtipp:pid') || null,
  expanded: new Set(),
  resultOpen: new Set(),
  pendingRender: false,
  overlayDismissed: false,
};

// ── helpers ─────────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const berlinFmtDate = () => new Intl.DateTimeFormat(getLang() === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'long' });
const berlinFmtTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const berlinDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
// Day grouping follows the host-country (US/CA/MX) local day so a late-night
// Berlin kickoff stays grouped with the evening it belongs to — otherwise
// people see it under "tomorrow" and forget to tip. Kickoff TIME stays Berlin.
const TOURN_TZ = 'America/Los_Angeles';
const tournFmtDate = () => new Intl.DateTimeFormat(getLang() === 'de' ? 'de-DE' : 'en-GB', { timeZone: TOURN_TZ, weekday: 'short', day: 'numeric', month: 'long' });
const tournDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TOURN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const kickoff = (m) => new Date(m.kickoffUTC);
const isLocked = (m) => now() >= kickoff(m).getTime();
const isLive = (m) => isLocked(m) && now() < kickoff(m).getTime() + 2.5 * 3600e3 && !getResult(m.id);
const tournamentStarted = () => now() >= new Date(TOURNAMENT_START_UTC).getTime();

const getResult = (id) => state.db.results?.[mk(id)] ?? null;
const getTip = (pid, id) => state.db.tips?.[pid]?.[mk(id)] ?? null;
const players = () => state.db.players || {};
const me = () => (state.pid ? players()[state.pid] : null);

function flagOf(name) { return state.teams[name]?.flag || ''; }

// Windows renders flag emoji as letter pairs, so flags are drawn as Twemoji SVGs.
function flagImg(emoji, cls = '') {
  if (!emoji) return '';
  const codes = [...emoji].map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== 'fe0f').join('-');
  return `<img class="flag-img ${cls}" src="https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${codes}.svg" alt="${esc(emoji)}" loading="lazy" />`;
}

function resolveTeam(m, side) {
  const ko = state.db.koTeams?.[mk(m.id)];
  const raw = ko?.[side] || m[side];
  const isReal = !!state.teams[raw];
  return { name: raw, real: isReal, flag: isReal ? flagOf(raw) : '❔', label: isReal ? teamName(raw) : placeholderLabel(raw) };
}

function placeholderLabel(p) {
  if (!p) return '—';
  const de = getLang() === 'de';
  let m;
  if ((m = /^([123])([A-L])$/.exec(p))) return de ? `${m[1]}. Gruppe ${m[2]}` : `${m[1]}${['st', 'nd', 'rd'][+m[1] - 1]} Group ${m[2]}`;
  if ((m = /^W(\d+)$/.exec(p))) return de ? `Sieger Spiel ${m[1]}` : `Winner M${m[1]}`;
  if ((m = /^L(\d+)$/.exec(p))) return de ? `Verlierer Spiel ${m[1]}` : `Loser M${m[1]}`;
  if (/^3rd/.test(p)) return de ? `Gruppendritter (${p.slice(4)})` : `3rd place (${p.slice(4)})`;
  return p;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

// ── data loading ────────────────────────────────────────────────────
async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function loadFixtures() {
  let data;
  try { data = await loadJSON('data/matches.json'); }
  catch { data = await loadJSON('data/matches.sample.json'); }
  state.matches = data.matches.sort((a, b) => new Date(a.kickoffUTC) - new Date(b.kickoffUTC) || a.id - b.id);
  state.groups = data.groups || {};
  state.teams = data.teams || {};
}

async function loadTeamsInfo() {
  try { state.teamsInfo = await loadJSON('data/teams-info.json'); } catch { state.teamsInfo = null; }
}

// ── views ───────────────────────────────────────────────────────────
function render() {
  if (document.activeElement?.classList?.contains('score-input')) { state.pendingRender = true; return; }
  state.pendingRender = false;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#lang-toggle').textContent = getLang().toUpperCase();
  $('#app-title').textContent = t('appTitle');
  updateInfoChip();
  const p = me();
  $('#player-chip').textContent = p ? `${p.emoji} ${p.name}` : '👤';
  $$('.tab-label').forEach((el) => { el.textContent = t(el.parentElement.dataset.tab === 'matches' ? 'tabMatches' : el.parentElement.dataset.tab === 'table' ? 'tabTable' : el.parentElement.dataset.tab === 'favorites' ? 'tabFavorites' : 'tabBonus'); });

  const view = $('#view');
  if (state.tab === 'matches') view.innerHTML = renderMatches();
  else if (state.tab === 'table') view.innerHTML = renderTable();
  else if (state.tab === 'favorites') view.innerHTML = renderFavorites();
  else view.innerHTML = renderBonus();
  bindView();
}

// — matches —
function filteredMatches() {
  const todayKey = tournDayKey.format(new Date(now()));
  if (state.filter === 'today') {
    const todays = state.matches.filter((m) => tournDayKey.format(kickoff(m)) === todayKey);
    if (todays.length) return todays;
    // nothing today → next upcoming day
    const next = state.matches.find((m) => !isLocked(m));
    if (!next) return [];
    const nextKey = tournDayKey.format(kickoff(next));
    return state.matches.filter((m) => tournDayKey.format(kickoff(m)) === nextKey);
  }
  if (state.filter === 'ko') return state.matches.filter((m) => m.stage !== 'group');
  if (state.filter === 'open') return state.matches.filter((m) => !isLocked(m));
  if (state.filter === 'played') return state.matches.filter((m) => isLocked(m));
  if (state.filter.startsWith('g:')) { const g = state.filter.slice(2); return state.matches.filter((m) => m.group === g); }
  return state.matches;
}

// — header info chip: next kickoff + my open tips —
function updateInfoChip() {
  const el = $('#info-chip');
  if (!el) return;
  const next = state.matches.find((m) => !isLocked(m));
  if (!next) { el.textContent = '🏁'; return; }
  const de = getLang() === 'de';
  const dayFmt = new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' });
  let text = `⚽ ${t('nextKickoff')}: ${dayFmt.format(kickoff(next))}, ${berlinFmtTime.format(kickoff(next))}${de ? ' Uhr' : ''}`;
  if (state.pid) {
    const openN = state.matches.filter((m) => !isLocked(m) && !getTip(state.pid, m.id)).length;
    text += ` · ${t('openTips', { n: openN })}`;
  }
  el.textContent = text;
}

function renderMatches() {
  const chips = [
    ['today', t('today')], ['open', t('filterOpen')], ['all', t('all')], ['ko', t('knockout')],
  ].map(([k, label]) => `<button class="filter-chip ${state.filter === k ? 'active' : ''}" data-filter="${k}">${label}</button>`).join('')
  + `<select class="filter-chip group-select ${state.filter.startsWith('g:') ? 'active' : ''}" id="group-filter" aria-label="${t('group')}">
      <option value="">${t('group')} ▾</option>
      ${Object.keys(state.groups).sort().map((g) => `<option value="g:${g}" ${state.filter === `g:${g}` ? 'selected' : ''}>${t('group')} ${g}</option>`).join('')}
    </select>
    <button class="filter-chip" data-refresh="1">🔄 ${t('refresh')}</button>`;

  const demoBanner = DEMO ? `<div class="panel demo-banner"><p>${t('demoBanner')}</p></div>` : '';
  // Champion bonus nudge on the main page until the player has picked.
  let bonusNudge = '';
  if (state.pid && !tournamentStarted() && !state.db.bonus?.[state.pid]?.champion) {
    bonusNudge = `<div class="card bonus-nudge">
      <div class="match-meta"><span>⭐ ${esc(t('bonusTitle'))}</span><span class="badge pts-badge pts-4">+${SCORING.championBonus} ${t('pts')}</span></div>
      <p class="notice">${t('bonusNudge', { pts: SCORING.championBonus })}</p>
      <select class="select champion-select" id="champion-select-main">${teamOptions(null)}</select>
    </div>`;
  }
  const list = filteredMatches();
  if (!list.length) return `${demoBanner}${bonusNudge}<div class="filters">${chips}</div><div class="empty-note">🏖️</div>`;

  let html = `${demoBanner}${bonusNudge}<div class="filters">${chips}</div>`;
  let lastDay = '', lastStage = '';
  for (const m of list) {
    if (m.stage !== lastStage && m.stage !== 'group') {
      html += `<div class="stage-header"><span class="display">${t('stages.' + m.stage)}</span></div>`;
    }
    lastStage = m.stage;
    const day = tournFmtDate().format(kickoff(m));
    if (day !== lastDay) { html += `<div class="date-header"><span>${day}</span></div>`; lastDay = day; }
    html += renderMatchCard(m);
  }
  return html;
}

function renderMatchCard(m) {
  const locked = isLocked(m);
  const live = isLive(m);
  const result = getResult(m.id);
  const myTip = state.pid ? getTip(state.pid, m.id) : null;
  const home = resolveTeam(m, 'home');
  const away = resolveTeam(m, 'away');
  const expanded = state.expanded.has(m.id);

  const stageLabel = m.stage === 'group' ? `${t('group')} ${m.group}` : t('stages.' + m.stage);
  const statusBadge = live ? `<span class="badge live-badge">● ${t('live')}</span>`
    : result && myTip ? ptsBadge(scoreTip(myTip, result))
    : '';

  const wr = (side) => {
    const rank = side.real ? fifaRankOf(side.name) : null;
    return rank != null ? `<span class="wr">WR ${rank}</span>` : '';
  };

  let center;
  if (!locked) {
    center = `<div class="mid">
      ${stepper(m.id, 'h', myTip?.h)}
      <span class="vs">:</span>
      ${stepper(m.id, 'a', myTip?.a)}
    </div>`;
  } else {
    const box = (v) => `<div class="scorebox static ${v == null ? 'empty' : ''}">${v == null ? '–' : v}</div>`;
    center = `<div class="mid mid-locked">
      <span class="mid-cap">${t('yourTip')}</span>
      <div class="mid-row">${box(myTip?.h)}<span class="vs">:</span>${box(myTip?.a)}</div>
    </div>`;
  }

  let extra = '';
  if (locked && result) {
    extra += `<div class="resband"><span class="final">${t('endstand').toUpperCase()}&nbsp;&nbsp;${result.h} : ${result.a}</span></div>`;
  }
  if (!locked) {
    const total = Object.keys(players()).length;
    const n = Object.keys(players()).filter((pid) => getTip(pid, m.id)).length;
    extra += `<div class="lockline">🔒 ${t('lockNote')}${total > 1 ? ` · 👥 ${t('tipped', { n, m: total })}` : ''}</div>`;
  }
  // Live matches are always folded out so everyone sees all tips without a click.
  if (locked && (expanded || live)) extra += renderAllTips(m, result);
  if (locked && ADMIN_PIDS.includes(state.pid)) {
    const open = state.resultOpen.has(m.id);
    extra += `<div class="result-entry">
      <button class="result-entry-toggle" data-resopen="${m.id}">✏️ ${t('enterResult')}${m.stage !== 'group' ? ` (${t('result90')})` : ''}</button>
      ${open ? resultForm(m, result) : ''}
    </div>`;
  }

  return `<div class="match-card card ${live ? 'live' : ''}" data-mid="${m.id}">
    <div class="match-meta">
      <span>${esc(stageLabel)}</span>
      <span class="meta-right">${statusBadge} ${berlinFmtTime.format(kickoff(m))}${getLang() === 'de' ? ' Uhr' : ''}</span>
    </div>
    <div class="match-row" ${locked ? `data-expand="${m.id}"` : ''}>
      <div class="team"><span class="flag">${flagImg(home.flag)}</span><span class="tname ${home.real ? '' : 'placeholder'}">${esc(home.label)}</span>${wr(home)}</div>
      ${center}
      <div class="team"><span class="flag">${flagImg(away.flag)}</span><span class="tname ${away.real ? '' : 'placeholder'}">${esc(away.label)}</span>${wr(away)}</div>
    </div>
    ${extra}
  </div>`;
}

const ptsBadge = (pts) => `<span class="badge pts-badge pts-${pts}">+${pts} ${t('pts')}</span>`;

function stepper(mid, side, val) {
  const v = Number.isInteger(val) ? val : '';
  return `<div class="score-stepper">
    <button class="step-btn" data-step="1" data-mid="${mid}" data-side="${side}">+</button>
    <input class="score-input" type="number" min="0" max="20" inputmode="numeric" value="${v}" data-mid="${mid}" data-side="${side}" name="tip-${mid}-${side}" aria-label="Tipp ${side === 'h' ? 'Heim' : 'Auswärts'}" />
    <button class="step-btn" data-step="-1" data-mid="${mid}" data-side="${side}">−</button>
  </div>`;
}

function renderAllTips(m, result) {
  const rows = Object.entries(players()).map(([pid, p]) => {
    const tip = getTip(pid, m.id);
    const pts = result && tip ? scoreTip(tip, result) : null;
    return `<div class="tip-row-line">
      <span class="who"><span>${p.emoji}</span> ${esc(p.name)}</span>
      <span class="tipval">${tip ? `${tip.h}:${tip.a}` : `<span class="no-tip">${t('noTip')}</span>`}${pts != null && tip ? ptsBadge(pts) : ''}</span>
    </div>`;
  }).join('');
  return `<div class="all-tips">${rows}</div>`;
}

function resultForm(m, result) {
  const teamSelects = (!resolveTeam(m, 'home').real || !resolveTeam(m, 'away').real) ? `
    <select class="select" data-koteam="home" data-mid="${m.id}">${teamOptions(state.db.koTeams?.[mk(m.id)]?.home)}</select>
    <select class="select" data-koteam="away" data-mid="${m.id}">${teamOptions(state.db.koTeams?.[mk(m.id)]?.away)}</select>` : '';
  return `<div class="result-entry-form">
    ${teamSelects}
    <input class="score-input" type="number" min="0" max="20" inputmode="numeric" id="res-h-${m.id}" value="${result?.h ?? ''}" />
    <span class="score-sep">:</span>
    <input class="score-input" type="number" min="0" max="20" inputmode="numeric" id="res-a-${m.id}" value="${result?.a ?? ''}" />
    <button class="btn" data-saveresult="${m.id}">${t('saveResult')}</button>
  </div>`;
}

function teamOptions(selected) {
  const names = Object.keys(state.teams).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  return `<option value="">${t('pickChampion')}</option>` + names.map((n) => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${flagOf(n)} ${esc(teamName(n))}</option>`).join('');
}

// — leaderboard —
function championResult() {
  // Champion = winner of the final (match with stage 'final'), only when teams are real.
  const final = state.matches.find((m) => m.stage === 'final');
  if (!final) return null;
  const res = getResult(final.id);
  if (!res) return null;
  const home = resolveTeam(final, 'home'), away = resolveTeam(final, 'away');
  if (!home.real || !away.real) return null;
  if (res.h > res.a) return home.name;
  if (res.a > res.h) return away.name;
  return res.winner === 'home' ? home.name : res.winner === 'away' ? away.name : null;
}

function dayWinner() {
  // Most recent Berlin day that has at least one result.
  const withResults = state.matches.filter((m) => getResult(m.id)?.h != null);
  if (!withResults.length) return null;
  const lastDay = berlinDayKey.format(kickoff(withResults[withResults.length - 1]));
  const dayMatches = withResults.filter((m) => berlinDayKey.format(kickoff(m)) === lastDay);
  const scores = Object.entries(players()).map(([pid, p]) => ({
    p, pts: dayMatches.reduce((sum, m) => sum + scoreTip(getTip(pid, m.id), getResult(m.id)), 0),
  }));
  const max = Math.max(...scores.map((s) => s.pts));
  if (max <= 0) return null;
  return { day: berlinFmtDate().format(kickoff(dayMatches[0])), winners: scores.filter((s) => s.pts === max), pts: max };
}

// Ranks as of the start of today (Berlin) — basis for movement arrows.
function ranksAtDayStart() {
  const todayKey = berlinDayKey.format(new Date(now()));
  const prevResults = {};
  for (const m of state.matches) {
    const r = state.db.results?.[mk(m.id)];
    if (r && berlinDayKey.format(kickoff(m)) !== todayKey) prevResults[mk(m.id)] = r;
  }
  const rows = computeStandings({ players: players(), tips: state.db.tips, results: prevResults, bonus: state.db.bonus, championResult: null });
  return Object.fromEntries(rows.map((r) => [r.pid, r.rank]));
}

function renderPodium(rows) {
  const hasResults = Object.values(state.db.results || {}).some((r) => r && r.h != null);
  if (!hasResults || rows.length < 2) return '';
  const top = rows.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : [top[0], top[1]];
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return `<div class="podium">${order.map((r) => `
    <div class="podium-col podium-r${r.rank}">
      <span class="podium-emoji">${r.emoji}</span>
      <span class="podium-name">${esc(r.name)}</span>
      <div class="podium-block"><span>${medals[r.rank] || r.rank}</span><b>${r.points}</b></div>
    </div>`).join('')}</div>`;
}

function renderTable() {
  const rows = computeStandings({
    players: players(), tips: state.db.tips, results: state.db.results,
    bonus: state.db.bonus, championResult: championResult(),
  });
  if (!rows.length) return `<div class="empty-note">${t('whoAreYou')} 👋</div>`;
  const prevRanks = ranksAtDayStart();
  const dw = dayWinner();
  const dwPanel = dw ? `<div class="panel day-winner"><h2>👑 ${t('dayWinner')} · ${dw.day}</h2>
    <p>${dw.winners.map((w) => `${w.p.emoji} <b>${esc(w.p.name)}</b>`).join(' & ')} — ${dw.pts} ${t('points')}</p></div>` : '';
  const html = rows.map((r) => {
    const prev = prevRanks[r.pid];
    const move = prev == null || prev === r.rank ? '' : prev > r.rank
      ? `<span class="move up">▲${prev - r.rank}</span>` : `<span class="move down">▼${r.rank - prev}</span>`;
    return `
    <div class="lb-row ${r.pid === state.pid ? 'me' : ''}">
      <span class="lb-rank r${r.rank}">${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank + '.'}</span>
      <div class="lb-who"><span class="emoji">${r.emoji}</span>
        <div><div class="nm">${esc(r.name)} ${move}</div>
        <div class="sub">${t('exact')} ${r.exact} · ${t('diffHits')} ${r.diff} · ${t('tendHits')} ${r.tend}${r.bonusPts ? ` · ⭐+${r.bonusPts}` : ''}</div></div>
      </div>
      <div class="lb-pts">${r.points}<small>${t('pts')}</small></div>
    </div>`;
  }).join('');
  const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB');
  const total = rows.length * STAKE.fee;
  const potPanel = `<div class="panel pot-panel">
    <div class="rsub">💰 ${t('pot')}</div>
    <ul class="rules-list">
      <li><span class="rlabel">${t('entry')}</span><span class="rpts">${STAKE.fee} €</span></li>
      <li><span class="rlabel">${t('potNow')}</span><span class="rpts">${fmt(total)} €</span></li>
    </ul>
    <div class="rsub">${t('payout')}</div>
    <ul class="rules-list">
      <li><span class="rlabel">${t('place1')}</span><span class="rpts">${fmt(total * STAKE.split[0])} €</span></li>
      <li><span class="rlabel">${t('place2')}</span><span class="rpts">${fmt(total * STAKE.split[1])} €</span></li>
      <li><span class="rlabel">${t('place3')}</span><span class="rpts">${fmt(total * STAKE.split[2])} €</span></li>
    </ul>
  </div>`;
  return `${dwPanel}${renderPodium(rows)}<div class="lb-card">${html}</div>${potPanel}`;
}

// — teams (groups + world ranking) —
function fifaRankOf(name) { return state.teamsInfo?.teams?.[name]?.fifaRank ?? null; }

function renderFavorites() {
  const sub = [
    ['groups', t('groupsView')], ['ranking', t('rankingView')],
  ].map(([k, label]) => `<button class="filter-chip ${state.teamsView === k ? 'active' : ''}" data-teamsview="${k}">${label}</button>`).join('');
  const body = state.teamsView === 'ranking' ? renderWorldRanking() : renderGroups();
  return `<div class="filters">${sub}</div>${body}`;
}

function groupStandings(g) {
  const stats = Object.fromEntries(state.groups[g].map((tm) => [tm, { team: tm, played: 0, pts: 0, gf: 0, ga: 0 }]));
  for (const m of state.matches) {
    if (m.group !== g || m.stage !== 'group') continue;
    const res = getResult(m.id);
    if (!res || res.h == null) continue;
    const h = stats[m.home], a = stats[m.away];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += res.h; h.ga += res.a; a.gf += res.a; a.ga += res.h;
    if (res.h > res.a) h.pts += 3; else if (res.h < res.a) a.pts += 3; else { h.pts++; a.pts++; }
  }
  return Object.values(stats).sort((x, y) =>
    y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || (fifaRankOf(x.team) ?? 999) - (fifaRankOf(y.team) ?? 999));
}

function renderGroups() {
  const started = tournamentStarted();
  const cards = Object.keys(state.groups).sort().map((g) => {
    const rows = groupStandings(g).map((s, i) => `
      <div class="fav-row fav-row-table">
        <span class="fav-rank">${i + 1}.</span>
        <span class="fav-flag">${flagImg(flagOf(s.team) || '🏳️')}</span>
        <div class="fav-name-wrap"><span class="fav-name">${esc(teamName(s.team))}</span></div>
        ${started
          ? `<span class="fav-fifa">${s.played} | ${s.gf}:${s.ga}</span><span class="fav-prob">${s.pts}</span>`
          : `<span class="fav-fifa"></span><span class="fav-fifa">${fifaRankOf(s.team) != null ? '#' + fifaRankOf(s.team) : ''}</span>`}
      </div>`).join('');
    const head = started
      ? `<div class="group-card-cols"><span></span><span></span><span></span><span>Sp | Tore</span><span>Pkt</span></div>` : '';
    return `<div class="group-card"><div class="group-card-title">${t('group')} ${g}</div>${head}${rows}</div>`;
  }).join('');
  return `<div class="group-grid">${cards}</div>
    <p class="stat-legend">${t('teamsExplain')}</p>`;
}

function renderWorldRanking() {
  if (!state.teamsInfo) return `<div class="empty-note">📊 …</div>`;
  const entries = Object.entries(state.teamsInfo.teams)
    .sort((a, b) => (a[1].fifaRank ?? 999) - (b[1].fifaRank ?? 999));
  const groupOf = {};
  for (const [g, teams] of Object.entries(state.groups)) for (const tm of teams) groupOf[tm] = g;
  const rows = entries.map(([name, v]) => `
    <div class="fav-row">
      <span class="fav-rank">#${v.fifaRank ?? '–'}</span>
      <span class="fav-flag">${flagImg(flagOf(name) || '🏳️')}</span>
      <div class="fav-name-wrap"><span class="fav-name">${esc(teamName(name))}</span></div>
      <span class="fav-fifa">${t('group')} ${groupOf[name] || '–'}</span>
    </div>`).join('');
  return `<div class="panel" style="padding:14px 16px"><p>${t('teamsExplain')}</p></div>
    <div class="lb-card">${rows}</div>
    <p class="stat-legend">${t('favSource')}: ${esc(state.teamsInfo.sources?.ranking || '')}</p>`;
}

// — PWA install —
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (state.tab === 'bonus') render();
});

function renderInstallPanel() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let body;
  if (installPrompt) body = `<button class="btn" id="install-btn" style="margin-top:10px">${t('installBtn')}</button>`;
  else if (isIos) body = `<p style="margin-top:8px">${t('installIos')}</p>`;
  else return '';
  return `<div class="panel"><h2>📲 ${t('installTitle')}</h2><p>${t('installText')}</p>${body}</div>`;
}

// — bonus —
function renderBonus() {
  const locked = tournamentStarted();
  const myPick = state.pid ? state.db.bonus?.[state.pid]?.champion : null;
  let pickUI;
  if (locked) {
    const rows = Object.entries(players()).map(([pid, p]) => {
      const pick = state.db.bonus?.[pid]?.champion;
      const paid = PAID_PIDS.includes(pid) ? ` <span class="paid-badge" title="${t('paid')}">✓</span>` : '';
      return `<div class="tip-row-line"><span class="who"><span>${p.emoji}</span> ${esc(p.name)}${paid}</span>
        <span class="tipval">${pick ? `${flagImg(flagOf(pick), 'flag-inline')} ${esc(teamName(pick))}` : `<span class="no-tip">${t('noTip')}</span>`}</span></div>`;
    }).join('');
    pickUI = `<p>${t('bonusLocked')}</p><div class="all-tips champ-list">${rows}</div>`;
  } else {
    pickUI = `<select class="select" id="champion-select">${teamOptions(myPick)}</select>`;
  }
  const adminSync = ADMIN_PIDS.includes(state.pid)
    ? `<button class="btn secondary" id="admin-sync-btn" style="width:100%;margin-top:10px">🔄 ${t('syncNow')}</button>` : '';
  const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB');
  const total = Object.keys(players()).length * STAKE.fee;
  const rule = (label, pts) => `<li><span class="rlabel">${label}</span><span class="rpts">${pts} ${t('pts')}</span></li>`;
  const ex = (tip, pts, note) => `<li><span class="rlabel">${t('yourTip')} <b>${tip}</b> → ${pts} ${t('pts')} · ${note}</span></li>`;
  return `<div class="panel">
      <h2>⭐ ${t('bonusTitle')}</h2>
      <p>${t('bonusExplain', { pts: SCORING.championBonus })}</p>
      ${pickUI}
      ${adminSync}
    </div>
    ${renderInstallPanel()}
    <div class="panel"><h2>📜 ${t('rules')}</h2>
      <div class="rsub">${t('rScore')}</div>
      <ul class="rules-list">
        ${rule(t('rExact'), SCORING.exact)}
        ${rule(t('rDiff'), SCORING.diff)}
        ${rule(t('rTend'), SCORING.tendency)}
        ${rule('⭐ ' + t('rChamp'), SCORING.championBonus)}
      </ul>
      <div class="rsub">${t('rExTitle')}</div>
      <ul class="rules-list rules-ex">
        ${ex('2:1', SCORING.exact, t('rExExact'))}
        ${ex('1:0', SCORING.diff, t('rExDiff'))}
        ${ex('3:0', SCORING.tendency, t('rExTend'))}
        ${ex('1:1', 0, '–')}
      </ul>
      <p class="rules-note">${t('rNote')}</p>
      <div class="rsub">💰 ${t('pot')}</div>
      <ul class="rules-list">
        <li><span class="rlabel">${t('entry')}</span><span class="rpts">${STAKE.fee} €</span></li>
        <li><span class="rlabel">${t('potNow')}</span><span class="rpts">${fmt(total)} €</span></li>
      </ul>
      <div class="rsub">${t('payout')}</div>
      <ul class="rules-list">
        <li><span class="rlabel">${t('place1')}</span><span class="rpts">${fmt(total * STAKE.split[0])} €</span></li>
        <li><span class="rlabel">${t('place2')}</span><span class="rpts">${fmt(total * STAKE.split[1])} €</span></li>
        <li><span class="rlabel">${t('place3')}</span><span class="rpts">${fmt(total * STAKE.split[2])} €</span></li>
      </ul>
    </div>`;
}

// ── player onboarding ───────────────────────────────────────────────
function showPlayerOverlay() {
  const list = Object.entries(players()).map(([pid, p]) =>
    `<button class="player-option" data-pick="${pid}"><span class="emoji">${p.emoji}</span> ${esc(p.name)}</button>`).join('');
  $('#overlay').innerHTML = `<div class="overlay-card">
    <h2>👋 ${t('whoAreYou')}</h2>
    <div class="player-list">${list}</div>
    <button class="btn secondary" id="new-player-btn" style="width:100%">➕ ${t('newPlayer')}</button>
    <div id="new-player-form" class="hidden">
      <label class="form-label">${t('yourName')}</label>
      <input class="text-input" id="np-name" maxlength="20" />
      <label class="form-label">${t('pickEmoji')}</label>
      <div class="emoji-grid">${EMOJIS.map((e, i) => `<div class="emoji-cell ${i === 0 ? 'selected' : ''}" data-emoji="${e}">${e}</div>`).join('')}</div>
      <label class="form-label">${t('pinLabel')}</label>
      <input class="text-input" id="np-pin" type="password" inputmode="numeric" maxlength="8" placeholder="····" />
      <button class="btn" id="np-save" style="width:100%;margin-top:18px">${t('letsGo')}</button>
    </div>
    <div id="pin-form" class="hidden">
      <label class="form-label" id="pin-for"></label>
      <input class="text-input" id="pin-entry" type="password" inputmode="numeric" maxlength="8" placeholder="····" />
      <button class="btn" id="pin-ok" style="width:100%;margin-top:18px">OK</button>
    </div>
  </div>`;
  $('#overlay').classList.remove('hidden');
  state.overlayDismissed = false;

  // Click on the backdrop (beside the card) or Escape closes the overlay —
  // lets you browse / check who's playing without being forced to log in.
  const closeOverlay = () => {
    $('#overlay').classList.add('hidden');
    state.overlayDismissed = true;
    document.removeEventListener('keydown', onEsc);
  };
  function onEsc(e) { if (e.key === 'Escape') closeOverlay(); }
  $('#overlay').onclick = (e) => { if (e.target === $('#overlay')) closeOverlay(); };
  document.addEventListener('keydown', onEsc);

  $('#new-player-btn').onclick = () => { $('#new-player-form').classList.remove('hidden'); $('#pin-form').classList.add('hidden'); $('#np-name').focus(); };
  $$('.emoji-cell').forEach((c) => c.onclick = () => { $$('.emoji-cell').forEach((x) => x.classList.remove('selected')); c.classList.add('selected'); });

  $('#np-save').onclick = async () => {
    const name = $('#np-name').value.trim();
    const pin = $('#np-pin').value.trim();
    if (!name || pin.length < 4) { toast(t('pinTooShort')); return; }
    const pid = name.toLowerCase().replace(/[^a-z0-9äöüß]/g, '-');
    if (players()[pid]) { toast(t('nameTaken')); return; }
    const emoji = $('.emoji-cell.selected')?.dataset.emoji || '⚽';
    await api.setPlayer(state.store, pid, { name, emoji, pin: await sha256(pin) });
    state.pid = pid;
    localStorage.setItem('wmtipp:pid', pid);
    $('#overlay').classList.add('hidden');
    document.removeEventListener('keydown', onEsc);
    render();
    checkCelebration();
    identify(pid, name);
    track('player_created');
  };

  $$('.player-option').forEach((btn) => btn.onclick = () => {
    const pid = btn.dataset.pick;
    const p = players()[pid];
    if (!p.pin) { adopt(pid); return; }
    $('#pin-form').classList.remove('hidden');
    $('#new-player-form').classList.add('hidden');
    $('#pin-for').textContent = `${t('pinFor')} ${p.name}`;
    $('#pin-entry').value = '';
    $('#pin-entry').focus();
    $('#pin-ok').onclick = async () => {
      if (await sha256($('#pin-entry').value.trim()) === p.pin) adopt(pid);
      else toast(t('wrongPin'));
    };
  });

  function adopt(pid) {
    state.pid = pid;
    localStorage.setItem('wmtipp:pid', pid);
    $('#overlay').classList.add('hidden');
    document.removeEventListener('keydown', onEsc);
    render();
    checkCelebration(); // store the points baseline for this player
    identify(pid, players()[pid]?.name);
    track('player_login');
  }
}

// ── event binding ───────────────────────────────────────────────────
function bindView() {
  $$('[data-filter]').forEach((b) => b.onclick = () => { state.filter = b.dataset.filter; render(); });
  const gf = $('#group-filter');
  if (gf) gf.onchange = () => { state.filter = gf.value || 'all'; render(); };
  const rf = $('[data-refresh]');
  if (rf) rf.onclick = async () => {
    rf.disabled = true;
    await syncResults(state, state.store).catch(() => {});
    toast(t('refreshed'));
    render();
  };
  $$('[data-teamsview]').forEach((b) => b.onclick = () => { state.teamsView = b.dataset.teamsview; render(); });

  $$('.step-btn').forEach((b) => b.onclick = () => {
    const { mid, side, step } = b.dataset;
    const input = $(`.score-input[data-mid="${mid}"][data-side="${side}"]`);
    const v = Math.max(0, Math.min(20, (parseInt(input.value, 10) || 0) + parseInt(step, 10)));
    input.value = v;
    saveTipFromInputs(mid);
  });

  $$('.score-input[data-mid]').forEach((inp) => {
    inp.onchange = () => saveTipFromInputs(inp.dataset.mid);
    inp.onblur = () => { if (state.pendingRender) setTimeout(() => state.pendingRender && render(), 150); };
  });

  $$('[data-expand]').forEach((row) => row.onclick = (e) => {
    if (e.target.closest('button, input, select')) return;
    const id = +row.dataset.expand;
    state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
    render();
  });

  $$('[data-resopen]').forEach((b) => b.onclick = () => {
    const id = +b.dataset.resopen;
    state.resultOpen.has(id) ? state.resultOpen.delete(id) : state.resultOpen.add(id);
    render();
  });

  $$('[data-saveresult]').forEach((b) => b.onclick = async () => {
    const id = +b.dataset.saveresult;
    const m = state.matches.find((x) => x.id === id);
    for (const sel of $$(`select[data-koteam][data-mid="${id}"]`)) {
      if (sel.value) {
        const cur = state.db.koTeams?.[mk(id)] || {};
        await api.setKoTeams(state.store, id, { ...cur, [sel.dataset.koteam]: sel.value });
      }
    }
    const h = parseInt($(`#res-h-${id}`).value, 10);
    const a = parseInt($(`#res-a-${id}`).value, 10);
    if (Number.isInteger(h) && Number.isInteger(a)) {
      let result = { h, a };
      if (m.stage !== 'group' && h === a) {
        const w = prompt(t('penaltyWinner'));
        if (w) {
          const home = resolveTeam(m, 'home'), away = resolveTeam(m, 'away');
          result.winner = w.toLowerCase().startsWith(home.label.toLowerCase().slice(0, 3)) ? 'home' : 'away';
        }
      }
      state.resultOpen.delete(id);
      toast(t('saved'));
      track('result_saved', { match: id });
      await api.setResult(state.store, id, result); // celebration toast may follow
    }
    state.resultOpen.delete(id);
    render();
  });

  const ib = $('#install-btn');
  if (ib) ib.onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') { installPrompt = null; toast(t('installed')); render(); }
  };

  $$('#champion-select, #champion-select-main').forEach((sel) => sel.onchange = async () => {
    if (!state.pid) return;
    await api.setBonus(state.store, state.pid, { champion: sel.value || null });
    toast(t('saved'));
    track('bonus_saved', { champion: sel.value });
  });

  const syncBtn = $('#admin-sync-btn');
  if (syncBtn) syncBtn.onclick = async () => {
    if (!ADMIN_PIDS.includes(state.pid)) return;
    const orig = syncBtn.textContent;
    syncBtn.disabled = true; syncBtn.textContent = t('syncing');
    try {
      const r = await syncResults(state, state.store);
      toast(t('syncDone', { n: r.updated || 0 }));
      track('admin_sync', { updated: r.updated || 0 });
    } catch (e) { toast('Sync: ' + (e?.message || 'error')); }
    syncBtn.disabled = false; syncBtn.textContent = orig;
    render();
  };
}

async function saveTipFromInputs(mid) {
  if (!state.pid) { showPlayerOverlay(); return; }
  const m = state.matches.find((x) => x.id === +mid);
  if (isLocked(m)) { render(); return; }
  const h = parseInt($(`.score-input[data-mid="${mid}"][data-side="h"]`).value, 10);
  const a = parseInt($(`.score-input[data-mid="${mid}"][data-side="a"]`).value, 10);
  if (Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0) {
    await api.setTip(state.store, state.pid, mid, { h, a });
    toast(t('saved'));
    track('tip_saved', { match: +mid, stage: m.stage });
  }
}

// ── boot ────────────────────────────────────────────────────────────
async function seedDemo() {
  if (Object.keys(players()).length) return;
  const pin = await sha256('0000');
  await api.setPlayer(state.store, 'anna', { name: 'Anna', emoji: '🦊', pin });
  await api.setPlayer(state.store, 'ben', { name: 'Ben', emoji: '🦁', pin });
  await api.setTip(state.store, 'anna', 1, { h: 2, a: 1 });
  await api.setTip(state.store, 'anna', 2, { h: 1, a: 0 });
  await api.setTip(state.store, 'anna', 4, { h: 2, a: 0 });
  await api.setTip(state.store, 'ben', 1, { h: 1, a: 1 });
  await api.setTip(state.store, 'ben', 2, { h: 0, a: 0 });
  await api.setTip(state.store, 'ben', 4, { h: 1, a: 2 });
  await api.setResult(state.store, 1, { h: 2, a: 1 });
}

function checkCelebration() {
  if (!state.pid) return;
  const rows = computeStandings({
    players: players(), tips: state.db.tips, results: state.db.results,
    bonus: state.db.bonus, championResult: championResult(),
  });
  const me = rows.find((r) => r.pid === state.pid);
  if (!me) return;
  const key = `wmtipp:lastpts:${state.pid}${DEMO ? ':demo' : ''}`;
  const prev = localStorage.getItem(key);
  if (prev != null && me.points > +prev) {
    confetti();
    toast(`+${me.points - +prev} ${t('pointsGained')} 🎉`);
  }
  localStorage.setItem(key, me.points);
}

async function main() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (!DEMO) initAnalytics();
  await Promise.all([loadFixtures(), loadTeamsInfo()]);
  state.store = await createStore({ forceLocal: DEMO, lsKey: DEMO ? 'wmtipp:demo' : undefined });
  let seeded = false;
  state.store.onData(async (data) => {
    state.db = data || {};
    if (DEMO && !seeded) { seeded = true; await seedDemo(); }
    if (state.pid && !players()[state.pid]) { state.pid = null; localStorage.removeItem('wmtipp:pid'); }
    render();
    checkCelebration();
    if (!state.pid && !state.overlayDismissed) showPlayerOverlay();
  });


  $$('.tab').forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; render(); });
  $('#lang-toggle').onclick = () => { setLang(getLang() === 'de' ? 'en' : 'de'); render(); };
  $('#player-chip').onclick = () => showPlayerOverlay();
  setInterval(() => { if (state.tab === 'matches') render(); }, 30000);

  // Auto-fill results once the tournament runs (daily-updated source).
  if (tournamentStarted()) {
    const doSync = () => syncResults(state, state.store).then((r) => r.updated && console.info('[sync]', r));
    setTimeout(doSync, 3000);
    setInterval(doSync, 6 * 3600e3);
  }
}

main().catch((err) => {
  $('#view').innerHTML = `<div class="empty-note">⚠️ ${esc(err.message)}</div>`;
  console.error(err);
});
