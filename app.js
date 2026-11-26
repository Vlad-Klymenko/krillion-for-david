import { QUESTIONS } from './data/questions.js';
import { createDive, findAnswer, scoreTier, getDepth } from './engine.js';

const $ = (id) => document.getElementById(id);
const format = (n) => Number(n).toLocaleString('en-AU');
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE_KEY = 'krillion-for-david-v1';
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}
const saved = loadSaved();
let personalBest = Number.isFinite(saved.best) ? Math.max(0, Math.min(700, saved.best)) : 0;
let timed = saved.timed === true;
let selectedCategory = 'all';
let lastQuestionIds = [];
let dive = [];
let results = [];
let attemptCounts = [];
let round = 0;
let settled = false;
let finished = false;
let timer = null;
let deadline = 0;
let diveNumber = 0;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: personalBest, timed })); }
  catch { /* The game also works when browser storage is unavailable. */ }
}
function totalScore() { return results.reduce((sum, result) => sum + (result?.score || 0), 0); }
function stopTimer() { if (timer !== null) clearInterval(timer); timer = null; }
function feedback(message, error = false) {
  $('answer-feedback').classList.toggle('error', error);
  $('answer-feedback').replaceChildren();
  const symbol = document.createElement('span');
  symbol.className = 'feedback-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = error ? '·' : '∞';
  $('answer-feedback').append(symbol, document.createTextNode(message));
}
function renderTimer() {
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  $('timer-readout').innerHTML = timed ? `${seconds}<span> SECONDS</span>` : '∞<span> UNLIMITED</span>';
  $('timer-readout').classList.toggle('urgent', timed && seconds <= 5);
  $('timer-readout').setAttribute('aria-label', timed ? `${seconds} seconds remaining` : 'Unlimited time');
  if (timed && seconds <= 0 && !settled && !finished) settleRound(null, 'timeout');
}
function startTimer() {
  stopTimer();
  deadline = Date.now() + 25000;
  renderTimer();
  if (timed && !settled && !finished) timer = setInterval(renderTimer, 200);
}
function updateDepth() {
  const score = totalScore();
  const depth = getDepth(score);
  $('depth').textContent = format(depth);
  $('total-points').textContent = format(score);
  $('personal-best').textContent = `${format(getDepth(personalBest))} m`;
  const percent = Math.min(100, depth / 7000 * 100);
  $('depth-fill').style.height = `${percent}%`;
  $('diver').style.top = `${percent}%`;
  $('zone').textContent = depth < 1000 ? 'Just beneath the surface' : depth < 3000 ? 'Into the twilight' : depth < 5000 ? 'Past the midnight zone' : depth < 6500 ? 'Down in the abyss' : 'One in a krillion';
}
function renderProgress() {
  $('round-label').textContent = `PROMPT ${round + 1} OF ${dive.length}`;
  $('round-dots').replaceChildren();
  for (let i = 0; i < dive.length; i++) {
    const dot = document.createElement('span');
    dot.className = `round-dot${i === round ? ' current' : i < round ? ' done' : ''}`;
    dot.setAttribute('aria-hidden', 'true');
    $('round-dots').append(dot);
  }
  $('round-dots').setAttribute('aria-label', `Prompt ${round + 1} of ${dive.length}`);
  $('max-points').textContent = String(dive.length * 100);
}
function renderRound(focus = false) {
  stopTimer();
  settled = false;
  const question = dive[round];
  $('question-category').textContent = question.category;
  $('prompt').textContent = question.prompt;
  $('question-note').textContent = question.note;
  $('answer-input').value = '';
  $('answer-input').disabled = false;
  $('answer-form').querySelector('button').disabled = false;
  $('answer-result').hidden = true;
  $('answer-result').replaceChildren();
  $('retry-button').hidden = true;
  $('next-button').hidden = true;
  $('skip-button').hidden = false;
  $('answer-explorer').hidden = true;
  $('answer-explorer').open = false;
  $('next-button').textContent = round === dive.length - 1 ? 'See my dive' : 'Next prompt';
  feedback(results[round]?.score ? `Your best here: ${results[round].score} points. Try for a deeper answer.` : timed ? '25 seconds. Wrong guesses cost nothing; retries are always available.' : 'Take your time. You have unlimited guesses.');
  renderProgress();
  updateDepth();
  startTimer();
  if (focus) $('answer-input').focus({ preventScroll: true });
}
function populateBank() {
  const question = dive[round];
  $('answer-count').textContent = `${question.answers.length} answers`;
  $('bank-note').textContent = 'Rarity points are curated estimates. This is the answer list used by this game.';
  $('answer-grid').replaceChildren();
  [...question.answers].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).forEach((answer) => {
    const row = document.createElement('div');
    row.className = 'bank-answer';
    const name = document.createElement('span');
    name.textContent = answer.name;
    const score = document.createElement('span');
    score.textContent = `${answer.score} pts`;
    score.style.color = scoreTier(answer.score).color;
    row.append(name, score);
    $('answer-grid').append(row);
  });
  $('source-link').textContent = question.source.title;
  $('source-link').href = question.source.url;
  $('answer-explorer').hidden = false;
}
function settleRound(answer, reason = 'answer') {
  stopTimer();
  settled = true;
  const old = results[round];
  const better = answer && (!old || answer.score > old.score);
  if (better) results[round] = { name: answer.name, score: answer.score };
  else if (!old) results[round] = { name: null, score: 0 };
  const best = results[round];
  $('answer-input').disabled = true;
  $('answer-form').querySelector('button').disabled = true;
  $('skip-button').hidden = true;
  $('retry-button').hidden = false;
  $('next-button').hidden = false;
  $('answer-result').hidden = false;
  const tier = scoreTier(answer?.score || 0);
  const name = answer?.name || (reason === 'timeout' ? 'Time for another try?' : 'A little breather.');
  const caption = answer ? tier.label : best.score ? `Your best answer stays: ${best.name}` : 'No points yet. A fresh retry is always here.';
  $('answer-result').innerHTML = `<div><strong class="result-name">${escape(name)}</strong><span class="result-tier" style="color:${tier.color}">${escape(caption)}</span>${answer && best.score > answer.score ? `<div class="result-best">Best kept: ${escape(best.name)} · ${best.score} pts</div>` : ''}</div><div class="result-score">${answer ? answer.score : best.score}<small>pts</small></div>`;
  feedback(answer ? (better ? `Nice find. That’s ${format(getDepth(answer.score))} m toward your dive.` : 'Your highest score for this prompt is kept. Try as often as you like.') : reason === 'timeout' ? 'Out of time, never out of chances. Retry with a fresh 25 seconds.' : 'You can move on or give this prompt another try.');
  populateBank();
  updateDepth();
  $('next-button').focus({ preventScroll: true });
}
function submitAnswer(event) {
  event.preventDefault();
  if (settled || finished) return;
  if (timed && Date.now() >= deadline) { settleRound(null, 'timeout'); return; }
  const input = $('answer-input').value.trim();
  if (!input) { feedback('Type an answer first. There’s no rush.', true); $('answer-input').focus(); return; }
  attemptCounts[round]++;
  const answer = findAnswer(dive[round], input);
  if (!answer) {
    feedback('Not in this answer bank. Try a different answer — unlimited guesses.', true);
    $('answer-input').focus({ preventScroll: true });
    $('answer-input').select();
    return;
  }
  settleRound(answer);
}
function startDive({ replay = false, focus = false } = {}) {
  stopTimer();
  if (!replay || !dive.length) {
    dive = createDive(QUESTIONS, { length: 7, category: selectedCategory, seed: `${Date.now()}-${++diveNumber}`, excludeIds: lastQuestionIds });
    lastQuestionIds = dive.map((question) => question.id);
  }
  round = 0;
  results = [];
  attemptCounts = Array(dive.length).fill(0);
  finished = false;
  $('results-screen').hidden = true;
  $('game-screen').hidden = false;
  renderRound(focus);
}
function finishDive() {
  stopTimer();
  finished = true;
  const total = totalScore();
  const newBest = total > personalBest;
  personalBest = Math.max(personalBest, total);
  persist();
  updateDepth();
  $('game-screen').hidden = true;
  $('results-screen').hidden = false;
  const attempts = attemptCounts.reduce((sum, count) => sum + count, 0);
  $('results-screen').innerHTML = `<div class="eyebrow mint">DIVE COMPLETE · FOR DAVID</div><h2 id="results-title">${total >= dive.length * 80 ? 'A beautifully deep dive.' : total > 0 ? 'A few more hidden gems.' : 'There’s a whole ocean to explore.'}</h2><div class="results-depth">${format(getDepth(total))}<span> m</span></div><div class="results-subtitle">${total} / ${dive.length * 100} points · ${attempts} guess${attempts === 1 ? '' : 'es'} · ${timed ? '25-second timer' : 'No timer'}</div>${newBest ? '<div class="best-badge">✦ A new personal best</div>' : ''}<div class="results-list">${dive.map((question, i) => `<div class="result-row"><span class="row-number">${String(i+1).padStart(2,'0')}</span><span>${escape(question.prompt)}<span class="row-answer">${escape(results[i]?.name || 'Skipped')}</span></span><span class="row-score" style="color:${scoreTier(results[i]?.score || 0).color}">${results[i]?.score || 0} pts</span></div>`).join('')}</div><div class="results-actions"><button class="submit-button" id="fresh-dive">Dive again</button><button class="continue-button" id="replay-dive">Replay these prompts</button></div><div class="results-secondary"><button class="text-button" id="copy-results">Copy dive report</button></div><p class="copy-status" id="copy-status" role="status"></p>`;
  $('fresh-dive').addEventListener('click', () => startDive({ focus: true }));
  $('replay-dive').addEventListener('click', () => startDive({ replay: true, focus: true }));
  $('copy-results').addEventListener('click', copyResults);
  $('results-title').tabIndex = -1;
  $('results-title').focus({ preventScroll: true });
}
async function copyResults() {
  const text = `Krillion Unlimited · For David\n${format(getDepth(totalScore()))} m · ${totalScore()}/${dive.length * 100} pts\n${results.map((result) => result?.score >= 85 ? '🟧' : result?.score >= 65 ? '🟨' : result?.score > 0 ? '🟩' : '⬛').join('')}\nUnlimited retries, endless dives.\n${location.href.split('?')[0].split('#')[0]}`;
  try { await navigator.clipboard.writeText(text); $('copy-status').textContent = 'Dive report copied.'; }
  catch {
    $('copy-status').textContent = 'Select and copy your dive report below.';
    let area = $('report-text');
    if (!area) { area = document.createElement('textarea'); area.id = 'report-text'; area.setAttribute('aria-label', 'Dive report to copy'); area.style.cssText = 'width:100%;min-height:130px;margin-top:10px;padding:12px;background:#092331;color:#f1f6f4;border:1px solid #42626d;border-radius:7px'; $('copy-status').after(area); }
    area.value = text; area.focus(); area.select();
  }
}

const categories = [...new Set(QUESTIONS.map((question) => question.category))].sort();
categories.forEach((category) => {
  const option = document.createElement('option');
  option.value = category;
  option.textContent = category;
  $('category').append(option);
});
$('category').addEventListener('change', () => { selectedCategory = $('category').value; startDive({ focus: true }); });
$('answer-form').addEventListener('submit', submitAnswer);
$('new-dive-button').addEventListener('click', () => startDive({ focus: true }));
$('retry-button').addEventListener('click', () => renderRound(true));
$('skip-button').addEventListener('click', () => settleRound(null, 'skip'));
$('next-button').addEventListener('click', () => { if (!settled) return; if (round === dive.length - 1) finishDive(); else { round++; renderRound(true); } });
$('timer-toggle').checked = timed;
$('timer-mode-label').textContent = timed ? '25-second timer' : 'No timer';
$('timer-toggle').addEventListener('change', () => {
  timed = $('timer-toggle').checked;
  $('timer-mode-label').textContent = timed ? '25-second timer' : 'No timer';
  persist();
  if (!settled && !finished) {
    startTimer();
    feedback(timed ? '25 seconds. Wrong guesses cost nothing; retries are always available.' : 'Take your time. You have unlimited guesses.');
  } else {
    deadline = Date.now() + 25000;
    renderTimer();
  }
});
const help = $('help-dialog');
$('help-button').addEventListener('click', () => help.showModal());
$('close-help').addEventListener('click', () => help.close());
$('help-done').addEventListener('click', () => help.close());
help.addEventListener('click', (event) => { if (event.target === help) { const rect = help.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) help.close(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && timed && !settled && !finished) renderTimer(); });
startDive();
