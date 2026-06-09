import { createStore, api } from './store.js';
import { syncResults } from './sync.js';
import { scoreTip, computeStandings } from './scoring.js';
import { t, getLang, setLang } from './i18n.js';
import { SCORING, TOURNAMENT_START_UTC } from './config.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EMOJIS = ['⚽', '🦁', '🦅', '🐺', '🦊', '🐻', '🐯', '🦄', '🐸', '🐙', '🦖', '🐬', '🦜', '🐢', '🚀', '🔥', '⭐', '🍀', '👑', '🎯', '🥨', '🍕', '🧙', '🤖'];

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
};

// ── helpers ─────────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const berlinFmtDate = () => new Intl.DateTimeFormat(getLang() === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'long' });
const berlinFmtTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const berlinDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

const kickoff = (m) => new Date(m.kickoffUTC);
const isLocked = (m) => Date.now() >= kickoff(m).getTime();
const isLive = (m) => isLocked(m) && Date.now() < kickoff(m).getTime() + 2.5 * 3600e3 && !getResult(m.id);
const tournamentStarted = () => Date.now() >= new Date(TOURNAMENT_START_UTC).getTime();

const getResult = (id) => state.db.results?.[id] ?? null;
const getTip = (pid, id) => state.db.tips?.[pid]?.[id] ?? null;
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
  const ko = state.db.koTeams?.[m.id];
  const raw = ko?.[side] || m[side];
  const isReal = !!state.teams[raw];
  return { name: raw, real: isReal, flag: isReal ? flagOf(raw) : '❔', label: isReal ? raw : placeholderLabel(raw) };
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
  $('#app-title').textContent = `🏆 ${t('appTitle')}`;
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
  const todayKey = berlinDayKey.format(new Date());
  if (state.filter === 'today') {
    const todays = state.matches.filter((m) => berlinDayKey.format(kickoff(m)) === todayKey);
    if (todays.length) return todays;
    // nothing today → next upcoming day
    const next = state.matches.find((m) => !isLocked(m));
    if (!next) return [];
    const nextKey = berlinDayKey.format(kickoff(next));
    return state.matches.filter((m) => berlinDayKey.format(kickoff(m)) === nextKey);
  }
  if (state.filter === 'group') return state.matches.filter((m) => m.stage === 'group');
  if (state.filter === 'ko') return state.matches.filter((m) => m.stage !== 'group');
  return state.matches;
}

function renderMatches() {
  const chips = [
    ['today', t('today')], ['all', t('all')], ['group', t('groupStage')], ['ko', t('knockout')],
  ].map(([k, label]) => `<button class="filter-chip ${state.filter === k ? 'active' : ''}" data-filter="${k}">${label}</button>`).join('');

  const list = filteredMatches();
  if (!list.length) return `<div class="filters">${chips}</div><div class="empty-note">🏖️</div>`;

  let html = `<div class="filters">${chips}</div>`;
  let lastDay = '', lastStage = '';
  for (const m of list) {
    if (m.stage !== lastStage && m.stage !== 'group') {
      html += `<div class="stage-header">${t('stages.' + m.stage)}</div>`;
    }
    lastStage = m.stage;
    const day = berlinFmtDate().format(kickoff(m));
    if (day !== lastDay) { html += `<div class="date-header">${day}</div>`; lastDay = day; }
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

  const stageBadge = m.stage === 'group'
    ? `<span class="badge group-badge">${t('group')} ${m.group}</span>`
    : `<span class="badge ko-badge">${t('stages.' + m.stage)}</span>`;
  const statusBadge = live ? `<span class="badge live-badge">● ${t('live')}</span>`
    : result && myTip ? ptsBadge(scoreTip(myTip, result))
    : '';

  let center;
  if (!locked) {
    center = `<div class="tip-box">
      ${stepper(m.id, 'h', myTip?.h)}
      <span class="score-sep">:</span>
      ${stepper(m.id, 'a', myTip?.a)}
    </div>`;
  } else {
    const big = result ? `${result.h} : ${result.a}` : `– : –`;
    center = `<div class="locked-tip">
      <span class="locked-score is-result">${big}</span>
      <span class="your-tip-line">${t('yourTip')}: ${myTip ? `${myTip.h}:${myTip.a}` : t('noTip')}</span>
    </div>`;
  }

  let extra = '';
  if (locked && expanded) extra += renderAllTips(m, result);
  if (locked) {
    const open = state.resultOpen.has(m.id);
    extra += `<div class="result-entry">
      <button class="result-entry-toggle" data-resopen="${m.id}">✏️ ${t('enterResult')}${m.stage !== 'group' ? ` (${t('result90')})` : ''}</button>
      ${open ? resultForm(m, result) : ''}
    </div>`;
  }

  return `<div class="match-card ${live ? 'live' : ''}" data-mid="${m.id}">
    <div class="match-meta">
      <div class="meta-left">${stageBadge}<span>${t('kickoffAt')} ${berlinFmtTime.format(kickoff(m))}</span></div>
      ${statusBadge}
    </div>
    <div class="match-row" ${locked ? `data-expand="${m.id}"` : ''}>
      <div class="team"><span class="flag">${flagImg(home.flag)}</span><span class="tname ${home.real ? '' : 'placeholder'}">${esc(home.label)}</span></div>
      ${center}
      <div class="team"><span class="flag">${flagImg(away.flag)}</span><span class="tname ${away.real ? '' : 'placeholder'}">${esc(away.label)}</span></div>
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
    <select class="select" data-koteam="home" data-mid="${m.id}">${teamOptions(state.db.koTeams?.[m.id]?.home)}</select>
    <select class="select" data-koteam="away" data-mid="${m.id}">${teamOptions(state.db.koTeams?.[m.id]?.away)}</select>` : '';
  return `<div class="result-entry-form">
    ${teamSelects}
    <input class="score-input" type="number" min="0" max="20" inputmode="numeric" id="res-h-${m.id}" value="${result?.h ?? ''}" />
    <span class="score-sep">:</span>
    <input class="score-input" type="number" min="0" max="20" inputmode="numeric" id="res-a-${m.id}" value="${result?.a ?? ''}" />
    <button class="btn" data-saveresult="${m.id}">${t('saveResult')}</button>
  </div>`;
}

function teamOptions(selected) {
  const names = Object.keys(state.teams).sort();
  return `<option value="">${t('pickChampion')}</option>` + names.map((n) => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${flagOf(n)} ${esc(n)}</option>`).join('');
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

function renderTable() {
  const rows = computeStandings({
    players: players(), tips: state.db.tips, results: state.db.results,
    bonus: state.db.bonus, championResult: championResult(),
  });
  if (!rows.length) return `<div class="empty-note">${t('whoAreYou')} 👋</div>`;
  const html = rows.map((r) => `
    <div class="lb-row ${r.pid === state.pid ? 'me' : ''}">
      <span class="lb-rank r${r.rank}">${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank + '.'}</span>
      <div class="lb-who"><span class="emoji">${r.emoji}</span>
        <div><div class="nm">${esc(r.name)}</div>
        <div class="sub">${t('exact')} ${r.exact} · ${t('diffHits')} ${r.diff} · ${t('tendHits')} ${r.tend}${r.bonusPts ? ` · ⭐+${r.bonusPts}` : ''}</div></div>
      </div>
      <div class="lb-pts">${r.points}<small>${t('pts')}</small></div>
    </div>`).join('');
  return `<div class="lb-card">${html}</div>
    <p class="stat-legend">${t('rulesText', SCORING)}</p>`;
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

function renderGroups() {
  const cards = Object.entries(state.groups).map(([g, teams]) => {
    const rows = [...teams]
      .sort((a, b) => (fifaRankOf(a) ?? 999) - (fifaRankOf(b) ?? 999))
      .map((name) => `
      <div class="fav-row fav-row-slim">
        <span class="fav-flag">${flagImg(flagOf(name) || '🏳️')}</span>
        <div class="fav-name-wrap"><span class="fav-name">${esc(name)}</span></div>
        <span class="fav-fifa">${fifaRankOf(name) != null ? '#' + fifaRankOf(name) : ''}</span>
      </div>`).join('');
    return `<div class="group-card"><div class="group-card-title">${t('group')} ${g}</div>${rows}</div>`;
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
      <div class="fav-name-wrap"><span class="fav-name">${esc(name)}</span></div>
      <span class="fav-fifa">${t('group')} ${groupOf[name] || '–'}</span>
    </div>`).join('');
  return `<div class="panel" style="padding:14px 16px"><p>${t('teamsExplain')}</p></div>
    <div class="lb-card">${rows}</div>
    <p class="stat-legend">${t('favSource')}: ${esc(state.teamsInfo.sources?.ranking || '')}</p>`;
}

// — bonus —
function renderBonus() {
  const locked = tournamentStarted();
  const myPick = state.pid ? state.db.bonus?.[state.pid]?.champion : null;
  let pickUI;
  if (locked) {
    const rows = Object.entries(players()).map(([pid, p]) => {
      const pick = state.db.bonus?.[pid]?.champion;
      return `<div class="tip-row-line"><span class="who"><span>${p.emoji}</span> ${esc(p.name)}</span>
        <span class="tipval">${pick ? `${flagImg(flagOf(pick), 'flag-inline')} ${esc(pick)}` : `<span class="no-tip">${t('noTip')}</span>`}</span></div>`;
    }).join('');
    pickUI = `<p>${t('bonusLocked')}</p><div class="all-tips">${rows}</div>`;
  } else {
    pickUI = `<select class="select" id="champion-select">${teamOptions(myPick)}</select>`;
  }
  return `<div class="panel">
      <h2>⭐ ${t('bonusTitle')}</h2>
      <p>${t('bonusExplain', { pts: SCORING.championBonus })}</p>
      ${pickUI}
    </div>
    <div class="panel"><h2>📜 ${t('rules')}</h2><p>${t('rulesText', SCORING)}</p></div>`;
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
    render();
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
    render();
  }
}

// ── event binding ───────────────────────────────────────────────────
function bindView() {
  $$('[data-filter]').forEach((b) => b.onclick = () => { state.filter = b.dataset.filter; render(); });
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
        const cur = state.db.koTeams?.[id] || {};
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
      await api.setResult(state.store, id, result);
    }
    state.resultOpen.delete(id);
    toast(t('saved'));
    render();
  });

  const champSel = $('#champion-select');
  if (champSel) champSel.onchange = async () => {
    if (!state.pid) return;
    await api.setBonus(state.store, state.pid, { champion: champSel.value || null });
    toast(t('saved'));
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
  }
}

// ── boot ────────────────────────────────────────────────────────────
async function main() {
  await Promise.all([loadFixtures(), loadTeamsInfo()]);
  state.store = await createStore();
  state.store.onData((data) => {
    state.db = data || {};
    if (state.pid && !players()[state.pid]) { state.pid = null; localStorage.removeItem('wmtipp:pid'); }
    render();
    if (!state.pid) showPlayerOverlay();
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
