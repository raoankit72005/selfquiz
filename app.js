import { validateBank, questionPool, createSession, sessionIsValid, scoreSession, recordResult, formatTime, escapeHTML as e } from './core.js';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'selfquiz.hs169.v1';
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
let bank, questions, lookup, weeks, view = 'practice', result = null, reviewFilter = 'all';
let studyWeek = 'all', studyQuery = '', reveal = false, storageWarning = false;
const defaults = () => ({ version: 1, bank: null, theme: 'light', bookmarks: [], stats: {}, attempts: [], active: null,
  preferences: { week: 'all', focus: 'all', mode: 'practice', count: 10, minutes: 15, shuffleQuestions: true, shuffleOptions: true } });
let state = defaults();
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (stored?.version === 1) state = { ...state, ...stored, preferences: { ...state.preferences, ...stored.preferences },
    bookmarks: Array.isArray(stored.bookmarks) ? stored.bookmarks.filter(v => typeof v === 'string') : [],
    attempts: Array.isArray(stored.attempts) ? stored.attempts.filter(a => a && Array.isArray(a.rows) && Number.isFinite(a.percent) && Number.isFinite(a.completedAt)).slice(0, 50) : [],
    stats: stored.stats && typeof stored.stats === 'object' && !Array.isArray(stored.stats) ? stored.stats : {} };
} catch { /* A blocked store or old data must not prevent studying. */ }
document.documentElement.dataset.theme = state.theme === 'dark' ? 'dark' : 'light';

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { if (!storageWarning) { storageWarning = true; toast('Browser storage is unavailable. Progress will last for this visit only.'); } }
}
function confirmAction(title, copy, label, action) {
  const dialog = $('#confirm-dialog');
  $('#dialog-title').textContent = title;
  $('#dialog-copy').textContent = copy;
  $('#dialog-confirm').textContent = label;
  dialog.returnValue = '';
  dialog.onclose = () => { if (dialog.returnValue === 'confirm') action(); };
  dialog.showModal();
}
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const date = time => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(time);
const weekOptions = (selected = 'all') => `<option value="all">All ${weeks.length} assignments</option>${weeks.map(week => `<option value="${week}" ${String(selected) === String(week) ? 'selected' : ''}>Assignment ${String(week).padStart(2, '0')} · ${e(questions.find(q => q.week === week)?.topic || 'Practice')}</option>`).join('')}`;
const source = q => q.sourcePage ? `<span class="source-link">Source: Assignment ${q.week} solution PDF · page ${e(q.sourcePage)}</span>` : '<span class="source-link">SelfQuiz demonstration answer key</span>';
const bookmark = q => `<button type="button" class="icon-button bookmark ${state.bookmarks.includes(q.id) ? 'saved' : ''}" data-action="bookmark" data-id="${e(q.id)}" aria-label="${state.bookmarks.includes(q.id) ? 'Remove bookmark' : 'Bookmark question'}" aria-pressed="${state.bookmarks.includes(q.id)}">${icon('bookmark')}</button>`;
function header(title, subtitle) {
  return `<header class="page-heading"><div><div class="eyebrow">YOUR PERSONAL STUDY SPACE</div><h1 tabindex="-1" id="page-title">${title}</h1><p>${subtitle}</p></div><div class="course-pill"><span class="status-dot"></span>${e(bank.courseCode)}</div></header>`;
}
function render() {
  const active = state.active && view === 'quiz';
  const nav = [['practice', 'grid', 'Practice'], ['study', 'book', 'Study deck'], ['bookmarks', 'bookmark', 'Bookmarks'], ['history', 'clock', 'My progress']];
  $('#app').innerHTML = `<div class="layout"><aside class="sidebar"><a href="#" class="brand" data-action="nav" data-view="practice"><span class="brand-mark">S<span>✦</span></span><span>SelfQuiz<span class="brand-caption">A LITTLE BETTER, EVERY DAY</span></span></a><div class="sidebar-label">WORKSPACE</div><nav class="navigation" aria-label="Main navigation">${nav.map(([id, glyph, label]) => `<button class="nav-item ${view === id || (view === 'quiz' || view === 'result') && id === 'practice' ? 'active' : ''}" data-action="nav" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'bookmarks' ? `<span class="nav-count">${state.bookmarks.length}</span>` : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="gentle-note"><span class="little-star">✦</span><p>Progress happens<br>one question at a time.</p><span>A small session counts.</span></div><button class="theme-button" data-action="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon')}<span>${state.theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span></button><div class="local-note"><span class="status-dot"></span>Progress saved on this browser</div></div></aside><div class="main-wrap"><main id="main" class="main ${active ? 'quiz-main' : ''}">${view === 'practice' ? dashboard() : view === 'study' || view === 'bookmarks' ? study() : view === 'history' ? history() : view === 'quiz' ? quiz() : results()}</main><footer class="footer"><span>SelfQuiz <span class="footer-star">✦</span> Made for focused practice.</span><span>${questions.length} questions · ${weeks.length} assignments · Saved on this browser</span></footer></div></div>`;
  if (view === 'quiz') updateClock();
}
function applyBank(value) {
  bank = validateBank(value); questions = bank.questions; lookup = new Map(questions.map(q => [q.id, q]));
  weeks = [...new Set(questions.map(q => q.week))].sort((a, b) => a - b);
}
function bankPanel() {
  return `<section class="bank-banner"><div><strong>${state.bank ? 'Your exam bank is loaded' : 'Try the demo, then bring your own exam'}</strong><p>${state.bank ? `${questions.length} questions · ${weeks.length} assignments · Kept in this browser` : 'The 3 sample questions show how it works. Import the exam-questions JSON to practice your course.'}</p></div><div class="button-row"><label class="button secondary import-label">${state.bank ? 'Change question bank' : 'Import exam questions'}<input type="file" id="bank-file" accept="application/json,.json"></label>${state.bank ? '<button class="text-button" data-action="demo-bank">Use demo</button>' : ''}</div></section>`;
}
async function importBank(file) {
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('Choose a question bank smaller than 2 MB.');
    const value = validateBank(JSON.parse(await file.text()));
    if (value.questions.length > 5000) throw new Error('A bank can contain up to 5,000 questions.');
    const begin = () => {
      const theme = state.theme; state = { ...defaults(), theme, bank: value }; applyBank(value);
      studyWeek = 'all'; studyQuery = ''; reveal = false; result = null; view = 'practice';
      persist(); render(); focusHeading(); toast(`Loaded ${questions.length} exam questions. Ready when you are.`);
    };
    if (state.attempts.length || state.active || state.bookmarks.length || state.bank) confirmAction('Load this question bank?', 'This switches the course and resets progress on this browser. Export a progress backup first to keep your current bank and results.', 'Load question bank', begin);
    else begin();
  } catch (error) { toast(error.message || 'Could not load that question bank.'); }
}
function dashboard() {
  const p = state.preferences;
  const pool = questionPool(questions, p, state);
  const seen = Object.keys(state.stats).filter(id => lookup.has(id)).length;
  const missed = questionPool(questions, { focus: 'missed' }, state).length;
  const avg = state.attempts.length ? Math.round(state.attempts.reduce((n, a) => n + a.percent, 0) / state.attempts.length) : null;
  return `${header('Make room for a little progress.', 'Pick a focus, find your rhythm, and make the next question count.')}${bankPanel()}<section class="hero"><div class="hero-copy"><div class="hero-tag">EXAM PREP, AT YOUR PACE</div><h2>A calmer way<br>to get exam-ready.</h2><p>${e(bank.course)}<br><span>${e(bank.institution)} · ${e(bank.courseCode)}</span></p><a class="hero-link" href="#study" data-action="nav" data-view="study">Explore the study deck ${icon('arrow')}</a></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-star star-one">✦</span><span class="art-star star-two">✦</span><div class="paper paper-back"></div><div class="paper paper-front"><span class="paper-kicker">YOUR NEXT CHAPTER</span><span class="paper-title">You’ve<br>got this.</span><div class="paper-rule"></div><div class="paper-line"><span>✓</span><i></i></div><div class="paper-line"><span>✓</span><i></i></div><div class="paper-line muted-line"><span>○</span><i></i></div></div><div class="art-badge">${icon('check')} Small steps. Real progress.</div></div></section><section class="stat-grid" aria-label="Study overview"><div class="stat-card"><span class="stat-icon">${icon('book')}</span><div><strong>${questions.length}</strong><span>Questions to explore</span></div></div><div class="stat-card"><span class="stat-icon blue">${icon('target')}</span><div><strong>${seen}<small> / ${questions.length}</small></strong><span>Questions practiced</span></div></div><div class="stat-card"><span class="stat-icon amber">${icon('bolt')}</span><div><strong>${avg === null ? '—' : avg + '%'}<small>${avg === null ? '' : ' average'}</small></strong><span>${state.attempts.length} completed sessions</span></div></div></section>${state.active ? `<section class="resume-banner"><div>${icon('clock')}<span><strong>You have a session in progress</strong><small>${state.active.items.length} questions · ${state.active.mode === 'exam' ? 'Timed exam' : 'Practice'} · ${Object.keys(state.active.answers).length} answered</small></span></div><button class="button primary" data-action="resume">Resume session ${icon('arrow')}</button></section>` : ''}<div class="dashboard-grid"><section class="panel setup-panel"><div class="panel-heading"><span class="section-number">01</span><div><h2>Let’s set up your session</h2><p>A quick refresh or a full rehearsal. You choose.</p></div></div><form id="setup-form"><fieldset><legend>How would you like to practice?</legend><div class="mode-grid"><label class="mode-card ${p.mode === 'practice' ? 'selected' : ''}"><input type="radio" name="mode" value="practice" ${p.mode === 'practice' ? 'checked' : ''}>${icon('bolt')}<strong>Practice</strong><span>Check answers as you go</span><span class="radio-dot"></span></label><label class="mode-card ${p.mode === 'exam' ? 'selected' : ''}"><input type="radio" name="mode" value="exam" ${p.mode === 'exam' ? 'checked' : ''}>${icon('clock')}<strong>Timed exam</strong><span>See answers after you finish</span><span class="radio-dot"></span></label></div></fieldset><div class="field"><label for="week">Choose your assignment</label><select name="week" id="week">${weekOptions(p.week)}</select></div><div class="field"><label for="focus">Question pool</label><select name="focus" id="focus"><option value="all" ${p.focus === 'all' ? 'selected' : ''}>All questions</option><option value="missed" ${p.focus === 'missed' ? 'selected' : ''}>Missed & skipped questions (${missed})</option><option value="bookmarked" ${p.focus === 'bookmarked' ? 'selected' : ''}>Bookmarked questions (${state.bookmarks.length})</option></select></div><div class="field"><div class="label-row"><label for="count">How many questions?</label><span>${pool.length} available</span></div><input id="count" name="count" type="number" ${pool.length ? '' : 'disabled'} min="1" max="${Math.max(1, pool.length)}" value="${Math.min(p.count, Math.max(1, pool.length))}" required><div class="chips">${[5, 10, 20, 'all'].map(n => `<button type="button" class="chip ${(n === 'all' ? p.count === pool.length : p.count === n) ? 'selected' : ''}" data-action="count" data-count="${n}" ${pool.length ? '' : 'disabled'}>${n === 'all' ? 'All questions' : n + ' questions'}</button>`).join('')}</div></div>${p.mode === 'exam' ? `<div class="field"><label for="minutes">Time limit (minutes)</label><input type="number" id="minutes" name="minutes" min="1" max="240" value="${e(p.minutes)}" required></div>` : ''}<div class="toggle-row"><label><input type="checkbox" name="shuffleQuestions" ${p.shuffleQuestions ? 'checked' : ''}> Shuffle questions</label><label><input type="checkbox" name="shuffleOptions" ${p.shuffleOptions ? 'checked' : ''}> Shuffle options</label></div>${pool.length ? '' : '<p class="inline-notice">No questions in this pool yet. Try all questions or another assignment.</p>'}<button class="button primary start-button" type="submit" ${!pool.length ? 'disabled' : ''}>Start ${p.mode === 'exam' ? 'exam' : 'practicing'} ${icon('arrow')}</button><p class="form-footnote">${p.mode === 'exam' ? 'One point per correct answer. No negative marking. Auto-submits when time is up.' : 'No timer. No pressure. Just you and the next question.'}</p></form></section><aside class="right-column"><section class="panel weekly-panel"><div class="panel-heading compact"><div><h2>Your assignments</h2><p>One assignment at a time.</p></div><span class="tiny-label">${weeks.length} ASSIGNMENTS</span></div><div class="week-grid">${weeks.map(week => { const qs = questions.filter(q => q.week === week), done = qs.filter(q => state.stats[q.id]?.lastCorrect === true).length; return `<button class="week-button ${done === qs.length ? 'complete' : ''}" data-action="week" data-week="${week}" aria-label="Practice assignment ${week}, ${done} of ${qs.length} most recently correct"><span>${String(week).padStart(2, '0')}</span><small>${done === qs.length ? '✓ Done' : `${done}/${qs.length}`}</small></button>`; }).join('')}</div><p class="week-legend"><span class="status-dot"></span>Filled when every latest answer is correct</p></section><section class="tip-card"><span class="tip-icon">✧</span><div class="eyebrow">A SMALL STUDY TIP</div><h3>Remember more.<br>Revisit what’s tricky.</h3><p>Save a question for later, or give missed questions another go. Repetition makes room for understanding.</p><button class="text-button" data-action="missed">Practice missed questions ${icon('arrow')}</button></section><div class="source-note">${icon('check')}<p><strong>Your study material, your browser.</strong>${state.bank ? 'Questions and answers come from your imported bank. Source page references help you check the original PDFs.' : 'The included questions demonstrate how the app works. Import your exam bank to start studying.'}</p></div></aside></div>`;
}
function readSettings() {
  const form = $('#setup-form');
  if (!form) return state.preferences;
  const data = new FormData(form);
  return { week: data.get('week'), focus: data.get('focus'), mode: data.get('mode'),
    count: Number(data.get('count') ?? state.preferences.count), minutes: Number(data.get('minutes') ?? state.preferences.minutes),
    shuffleQuestions: data.has('shuffleQuestions'), shuffleOptions: data.has('shuffleOptions') };
}
function startQuiz() {
  const settings = readSettings();
  const pool = questionPool(questions, settings, state);
  const begin = () => {
    try { state.active = createSession(pool, settings); state.preferences = settings; persist(); view = 'quiz'; result = null; render(); focusHeading(); }
    catch (error) { toast(error.message); }
  };
  if (state.active) confirmAction('Start a fresh session?', 'Your current unfinished session will be replaced. Completed sessions will stay in your history.', 'Start fresh', begin);
  else begin();
}
function quiz() {
  const session = state.active;
  if (!session) { view = 'practice'; return dashboard(); }
  const item = session.items[session.index], q = lookup.get(item.id);
  const choice = session.answers[q.id], checked = session.mode === 'practice' && session.checked.includes(q.id);
  const answered = Object.keys(session.answers).length;
  const correct = choice === q.answer;
  return `<div class="session-top"><button class="back-button" data-action="pause">← Save & exit</button><span class="session-mode">${icon(session.mode === 'exam' ? 'clock' : 'bolt')}${session.mode === 'exam' ? 'Timed exam' : 'Practice session'}</span><span class="timer ${session.mode === 'exam' ? 'exam-timer' : ''}" id="timer">${icon('clock')}<span id="clock-text">00:00</span></span></div><div class="session-layout"><section class="question-area"><div class="quiz-progress-heading"><span>Question <strong>${session.index + 1}</strong> of ${session.items.length}</span><span>${answered} answered</span></div><div class="progress-track"><span style="width:${pct(answered, session.items.length)}%"></span></div><article class="panel question-panel"><div class="question-heading"><span class="badge">ASSIGNMENT ${String(q.week).padStart(2, '0')}</span><div class="question-tools"><button class="icon-button ${session.flags.includes(q.id) ? 'saved' : ''}" data-action="flag" aria-pressed="${session.flags.includes(q.id)}" aria-label="Flag for review">${icon('flag')}</button>${bookmark(q)}</div></div><p class="question-topic">${e(q.topic)} · Source question ${q.number}</p><h1 class="question-title" id="page-title" tabindex="-1">${e(q.question)}</h1><div class="answer-options" role="group" aria-label="Answer options">${item.order.map((original, i) => `<button class="answer-option ${choice === original ? 'chosen' : ''} ${checked && original === q.answer ? 'correct' : ''} ${checked && choice === original && !correct ? 'incorrect' : ''}" data-action="answer" data-choice="${original}" ${checked ? 'disabled' : ''} aria-pressed="${choice === original}"><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${e(q.options[original])}</span>${checked && original === q.answer ? icon('check') : checked && choice === original ? icon('close') : ''}</button>`).join('')}</div>${checked ? `<div class="answer-feedback ${correct ? 'positive' : 'negative'}" role="status">${icon(correct ? 'check' : 'book')}<div><strong>${correct ? 'You’ve got it.' : 'One to come back to.'}</strong><p>${correct ? 'Your answer matches the assignment key.' : `Correct answer: ${e(q.options[q.answer])}`}</p>${source(q)}</div></div>` : session.mode === 'exam' ? '<p class="quiet-note">Answers stay hidden until you submit your exam.</p>' : '<p class="quiet-note">Choose an answer, then check it when you’re ready.</p>'}</article><div class="quiz-bottom"><button class="button secondary" data-action="previous" ${session.index === 0 ? 'disabled' : ''}>← Previous</button><div class="button-row">${session.mode === 'practice' && !checked ? `<button class="button primary" data-action="check" ${choice === undefined ? 'disabled' : ''}>Check answer ${icon('check')}</button>` : ''}${session.index < session.items.length - 1 ? `<button class="button ${checked || session.mode === 'exam' ? 'primary' : 'secondary'}" data-action="next">${choice === undefined ? 'Skip' : 'Next'} ${icon('arrow')}</button>` : '<button class="button primary" data-action="finish">Finish session</button>'}</div></div><p class="keyboard-note"><kbd>1</kbd>–<kbd>4</kbd> choose · <kbd>Enter</kbd> check / next · <kbd>←</kbd><kbd>→</kbd> navigate</p></section><aside class="panel question-navigator"><div class="panel-heading compact"><h2>Your questions</h2><span class="tiny-label">${session.items.length}</span></div><div class="question-map">${session.items.map((it, i) => `<button class="map-button ${i === session.index ? 'current' : ''} ${session.answers[it.id] !== undefined ? 'answered' : ''} ${session.flags.includes(it.id) ? 'flagged' : ''}" data-action="jump" data-index="${i}" aria-label="Question ${i + 1}${session.answers[it.id] !== undefined ? ', answered' : ', unanswered'}${session.flags.includes(it.id) ? ', flagged' : ''}" ${i === session.index ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div><div class="map-legend"><span><i class="legend-dot answered-dot"></i>Answered</span><span><i class="legend-dot"></i>Unanswered</span><span><i class="flag-dot"></i>Flagged</span></div><button class="button secondary full-width" data-action="finish">Submit ${session.mode === 'exam' ? 'exam' : 'session'}</button><p class="quiet-note">Your session saves as you go.</p></aside></div>`;
}
function updateClock() {
  if (!state.active || view !== 'quiz') return;
  const session = state.active, now = Date.now();
  if (session.mode === 'exam' && now >= session.deadline) { complete(true); return; }
  const time = session.mode === 'exam' ? session.deadline - now : now - session.startedAt;
  if ($('#clock-text')) $('#clock-text').textContent = formatTime(time);
  $('#timer')?.classList.toggle('urgent', session.mode === 'exam' && time < 60000);
}
function complete(expired = false) {
  if (!state.active) return;
  result = scoreSession(state.active, questions);
  state = recordResult(state, result); persist();
  view = 'result'; reviewFilter = 'all'; render(); focusHeading();
  if (expired) toast('Time is up. Your exam has been submitted.');
}
function requestFinish() {
  const s = state.active;
  if (!s) return;
  const unanswered = s.items.length - Object.keys(s.answers).length;
  confirmAction('Ready to finish?', unanswered ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered. Skipped questions receive zero points. You can review every answer after submitting.` : 'Your answers will be scored and saved. You can review the answer key next.', 'Submit session', () => complete());
}
function results() {
  if (!result) { view = 'practice'; return dashboard(); }
  return `${header('Every session is a step forward.', 'Here’s what you know, and what’s worth another look.')}<section class="result-hero"><div class="score-ring" style="--score:${result.percent}%"><span><strong>${result.percent}<small>%</small></strong><span>SESSION SCORE</span></span></div><div class="result-copy"><span class="eyebrow">${result.mode === 'exam' ? 'EXAM' : 'PRACTICE'} COMPLETE</span><h2>${result.percent >= 80 ? 'Look at that progress.' : result.percent >= 50 ? 'You’re building momentum.' : 'A good place to grow from.'}</h2><p>${result.correct} of ${result.total} correct · ${formatTime(result.duration)} elapsed</p><div class="button-row"><button class="button primary" data-action="nav" data-view="practice">Practice again ${icon('arrow')}</button>${result.wrong + result.skipped > 0 ? '<button class="button secondary" data-action="retry">Retry missed questions</button>' : ''}</div></div></section><div class="result-stats"><div><span class="status-dot"></span><strong>${result.correct}</strong> correct</div><div><span class="legend-dot wrong-dot"></span><strong>${result.wrong}</strong> incorrect</div><div><span class="legend-dot"></span><strong>${result.skipped}</strong> skipped</div></div><section><div class="review-heading"><h2>Your answer review</h2><div class="chips"><button class="chip ${reviewFilter === 'all' ? 'selected' : ''}" data-action="review-filter" data-filter="all">All answers</button><button class="chip ${reviewFilter === 'missed' ? 'selected' : ''}" data-action="review-filter" data-filter="missed">Missed & skipped</button></div></div>${result.rows.filter(r => reviewFilter === 'all' || !r.correct).map((row, i) => { const q = lookup.get(row.id); if (!q) return ''; return `<article class="panel review-card"><div class="question-heading"><span class="badge ${row.correct ? 'good-badge' : 'neutral-badge'}">${row.correct ? 'CORRECT' : row.skipped ? 'SKIPPED' : 'INCORRECT'} · ASSIGNMENT ${q.week}</span>${bookmark(q)}</div><h3>${i + 1}. ${e(q.question)}</h3>${!row.correct ? `<p class="your-answer">Your answer: <span>${row.skipped ? 'Not answered' : e(q.options[row.choice])}</span></p>` : ''}<div class="correct-answer">${icon('check')}<span>${e(q.options[q.answer])}</span></div><div class="review-source">According to the supplied assignment key. ${source(q)}</div></article>`; }).join('') || emptyState('All clear.', 'You answered every question correctly. Time for another assignment?', 'Practice again', 'practice')}</section>`;
}
function study() {
  const saved = view === 'bookmarks';
  return `${header(saved ? 'Keep the tricky ones close.' : 'Get to know the material.', saved ? 'Your saved questions, ready whenever you are.' : 'Read, recall, and reveal. A little understanding goes a long way.')}<section class="panel study-toolbar"><div class="study-filters"><div class="field"><label for="study-search">Find a question</label><div class="search-wrap">${icon('search')}<input type="search" id="study-search" placeholder="Search a question, answer, or topic…" value="${e(studyQuery)}"></div></div><div class="field"><label for="study-week">Assignment</label><select id="study-week">${weekOptions(studyWeek)}</select></div></div><div class="study-toolbar-bottom"><span id="study-count" class="muted"></span><label class="reveal-toggle"><input id="reveal-all" type="checkbox" ${reveal ? 'checked' : ''}> Show all answers</label></div></section><div id="study-list">${studyCards()}</div>`;
}
function studyCards() {
  const query = studyQuery.trim().toLocaleLowerCase();
  const pool = questionPool(questions, { week: studyWeek, focus: view === 'bookmarks' ? 'bookmarked' : 'all' }, state)
    .filter(q => [q.question, ...q.options, q.topic].join(' ').toLocaleLowerCase().includes(query));
  // render() updates the count after inserting the markup.
  queueMicrotask(() => { if ($('#study-count')) $('#study-count').textContent = `${pool.length} of ${view === 'bookmarks' ? state.bookmarks.length : questions.length} questions`; });
  if (!pool.length) return emptyState(view === 'bookmarks' && !state.bookmarks.length ? 'A place for your “one more time” questions.' : 'No questions found.', view === 'bookmarks' && !state.bookmarks.length ? 'Tap the bookmark icon on any question to save it here.' : 'Try another keyword or assignment.', 'Browse study deck', 'study');
  return pool.map(q => `<article class="panel study-card"><div class="question-heading"><span class="badge">ASSIGNMENT ${String(q.week).padStart(2, '0')} · Q${q.number}</span>${bookmark(q)}</div><h2>${e(q.question)}</h2><ul class="study-options">${q.options.map((o, i) => `<li><span>${String.fromCharCode(65 + i)}</span>${e(o)}</li>`).join('')}</ul><details ${reveal ? 'open' : ''}><summary>Reveal answer <span>+</span></summary><div class="correct-answer">${icon('check')}<span>${e(q.options[q.answer])}</span></div><p class="review-source">Answer from the supplied assignment key. ${source(q)}</p></details></article>`).join('');
}
function emptyState(title, copy, label = '', target = '') {
  return `<div class="empty-state"><span class="empty-icon">✧</span><h2>${title}</h2><p>${copy}</p>${label ? `<button class="button secondary" data-action="nav" data-view="${target}">${label} ${icon('arrow')}</button>` : ''}</div>`;
}
function history() {
  const attempts = state.attempts, seen = Object.keys(state.stats).filter(id => lookup.has(id)).length;
  const right = questions.filter(q => state.stats[q.id]?.lastCorrect).length;
  return `${header('Your effort, adding up.', 'Small sessions become a bigger picture. See how far you’ve come.')}<section class="stat-grid"><div class="stat-card"><span class="stat-icon">${icon('check')}</span><div><strong>${attempts.length}</strong><span>Saved sessions</span></div></div><div class="stat-card"><span class="stat-icon blue">${icon('book')}</span><div><strong>${pct(seen, questions.length)}%</strong><span>Question bank explored</span></div></div><div class="stat-card"><span class="stat-icon amber">${icon('target')}</span><div><strong>${right}<small> / ${questions.length}</small></strong><span>Most recently correct</span></div></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Session history</h2><p>Your latest 50 completed sessions are kept here.</p></div></div>${attempts.length ? `<div class="history-list">${attempts.map(a => `<button class="history-row" data-action="history-result" data-id="${e(a.id)}"><span class="history-icon">${icon(a.mode === 'exam' ? 'clock' : 'bolt')}</span><span><strong>${a.mode === 'exam' ? 'Timed exam' : 'Practice session'}</strong><small>${e(date(a.completedAt))} · ${a.total} questions · ${formatTime(a.duration)}</small></span><span class="history-score">${a.percent}%<small>${a.correct}/${a.total} correct</small></span><span>↗</span></button>`).join('')}</div>` : emptyState('Your first session starts the story.', 'Complete a practice or exam to see your results here.', 'Start practicing', 'practice')}</section><aside class="panel"><div class="panel-heading"><div><h2>Assignment progress</h2><p>Based on your latest answer to each question.</p></div></div><div class="assignment-progress">${weeks.map(week => { const qs = questions.filter(q => q.week === week), done = qs.filter(q => state.stats[q.id]?.lastCorrect).length; return `<div><div class="label-row"><span>Assignment ${String(week).padStart(2, '0')}</span><strong>${done}/${qs.length}</strong></div><div class="progress-track"><span style="width:${pct(done, qs.length)}%"></span></div></div>`; }).join('')}</div></aside></div><div class="data-actions"><p>Progress lives on this device and browser. Export a backup before clearing browser data.</p><div class="button-row"><button class="button secondary" data-action="export">${icon('download')} Export progress</button><label class="button secondary import-label">Restore backup<input type="file" id="restore-file" accept="application/json,.json"></label><button class="text-button danger" data-action="reset">Reset progress</button></div></div>`;
}
function focusHeading() { $('#page-title')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function navigate(next) {
  if (next === 'quiz' && !state.active) next = 'practice';
  if (view === 'practice') { state.preferences = readSettings(); persist(); }
  view = next; if (next === 'study' && !state.bookmarks.length) { studyWeek = 'all'; studyQuery = ''; }
  render(); focusHeading();
}
function toggleBookmark(id) {
  if (!lookup.has(id)) return;
  const saved = state.bookmarks.includes(id);
  state.bookmarks = saved ? state.bookmarks.filter(v => v !== id) : [...state.bookmarks, id]; persist();
  // Update buttons in place so study search, scroll position, and open answers stay intact.
  document.querySelectorAll(`[data-action="bookmark"][data-id="${id}"]`).forEach(b => { b.classList.toggle('saved', !saved); b.setAttribute('aria-pressed', String(!saved)); b.setAttribute('aria-label', saved ? 'Bookmark question' : 'Remove bookmark'); });
  if ($('.nav-count')) $('.nav-count').textContent = state.bookmarks.length;
  if (view === 'bookmarks') $('#study-list').innerHTML = studyCards();
  toast(saved ? 'Bookmark removed.' : 'Saved to your bookmarks.');
}
function selectAnswer(choice) {
  const s = state.active; if (!s) return;
  if (s.mode === 'exam' && Date.now() >= s.deadline) return complete(true);
  const q = lookup.get(s.items[s.index].id);
  if (s.mode === 'practice' && s.checked.includes(q.id)) return;
  s.answers[q.id] = choice; persist(); render();
}
function move(delta) {
  const s = state.active; if (!s) return;
  s.index = Math.min(s.items.length - 1, Math.max(0, s.index + delta)); persist(); render(); focusHeading();
}
document.addEventListener('submit', event => {
  if (event.target.id === 'setup-form') { event.preventDefault(); startQuiz(); }
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  event.preventDefault();
  const { action, id } = button.dataset;
  if (action === 'nav') return navigate(button.dataset.view);
  if (action === 'theme') { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme; persist(); render(); return; }
  if (action === 'bookmark') return toggleBookmark(id);
  if (action === 'count') { const pool = questionPool(questions, readSettings(), state); $('#count').value = button.dataset.count === 'all' ? Math.max(1, pool.length) : Math.max(1, Math.min(Number(button.dataset.count), pool.length)); state.preferences = readSettings(); persist(); render(); return; }
  if (action === 'week' || action === 'missed') { state.preferences = { ...readSettings(), week: action === 'week' ? button.dataset.week : 'all', focus: action === 'week' ? 'all' : 'missed', count: action === 'week' ? questions.filter(q => q.week === Number(button.dataset.week)).length : 10 }; view = 'practice'; persist(); render(); $('#setup-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (action === 'resume') { view = 'quiz'; render(); focusHeading(); return; }
  if (action === 'pause') return navigate('practice');
  if (action === 'answer') return selectAnswer(Number(button.dataset.choice));
  if (action === 'check') { const s = state.active, qid = s.items[s.index].id; if (s.answers[qid] !== undefined && !s.checked.includes(qid)) { s.checked.push(qid); persist(); render(); } return; }
  if (action === 'next' || action === 'previous') return move(action === 'next' ? 1 : -1);
  if (action === 'jump') { state.active.index = Number(button.dataset.index); persist(); render(); focusHeading(); return; }
  if (action === 'flag') { const s = state.active, qid = s.items[s.index].id; s.flags = s.flags.includes(qid) ? s.flags.filter(v => v !== qid) : [...s.flags, qid]; persist(); render(); return; }
  if (action === 'finish') return requestFinish();
  if (action === 'review-filter') { reviewFilter = button.dataset.filter; render(); return; }
  if (action === 'history-result') { result = state.attempts.find(a => a.id === id); view = 'result'; reviewFilter = 'all'; render(); focusHeading(); return; }
  if (action === 'retry') {
    const ids = result.rows.filter(r => !r.correct).map(r => r.id), pool = questions.filter(q => ids.includes(q.id));
    const begin = () => { state.active = createSession(pool, { ...state.preferences, mode: 'practice', count: pool.length }); view = 'quiz'; persist(); render(); focusHeading(); };
    if (state.active) confirmAction('Replace your unfinished session?', 'Your unfinished session will be replaced by this missed-question practice.', 'Start retry', begin); else begin(); return;
  }
  if (action === 'demo-bank') return confirmAction('Switch to the demo bank?', 'Your imported bank and its progress will be removed from this browser. Export a progress backup first to keep a copy.', 'Use demo bank', async () => { const response = await fetch('./data/questions.json'); const demo = await response.json(); const theme = state.theme; state = { ...defaults(), theme }; applyBank(demo); view = 'practice'; result = null; persist(); render(); });
  if (action === 'reset') return confirmAction('Reset all your progress?', 'This removes saved sessions, bookmarks, question progress, and the unfinished session from this browser. Export a backup first if you want to keep them.', 'Reset progress', () => { const theme = state.theme, currentBank = state.bank; state = { ...defaults(), theme, bank: currentBank }; result = null; persist(); render(); toast('Progress reset. A fresh start.'); });
  if (action === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...state, active: null }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'selfquiz-progress.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
document.addEventListener('change', event => {
  if (event.target.closest('#setup-form')) { state.preferences = readSettings(); persist(); if (['mode', 'week', 'focus'].includes(event.target.name)) render(); }
  if (event.target.id === 'study-week') { studyWeek = event.target.value; $('#study-list').innerHTML = studyCards(); }
  if (event.target.id === 'reveal-all') { reveal = event.target.checked; $('#study-list').innerHTML = studyCards(); }
  if (event.target.id === 'restore-file') restoreBackup(event.target.files[0]);
  if (event.target.id === 'bank-file') importBank(event.target.files[0]);
});
document.addEventListener('input', event => {
  if (event.target.id === 'study-search') { studyQuery = event.target.value; $('#study-list').innerHTML = studyCards(); }
});
document.addEventListener('keydown', event => {
  if (view !== 'quiz' || !state.active || $('#confirm-dialog').open || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, summary, a')) return;
  const s = state.active;
  if (/^[1-4]$/.test(event.key)) { event.preventDefault(); return selectAnswer(s.items[s.index].order[Number(event.key) - 1]); }
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); return move(event.key === 'ArrowRight' ? 1 : -1); }
  // Focused buttons retain native Enter/Space behavior.
  if (event.key === 'Enter' && !event.target.closest('button')) { event.preventDefault(); const qid = s.items[s.index].id;
    if (s.mode === 'practice' && !s.checked.includes(qid)) { if (s.answers[qid] !== undefined) { s.checked.push(qid); persist(); render(); } }
    else if (s.index < s.items.length - 1) move(1); else requestFinish();
  }
});
async function restoreBackup(file) {
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('Choose a SelfQuiz backup smaller than 2 MB.');
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.attempts) || !Array.isArray(data.bookmarks) || !data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) throw new Error('This is not a valid SelfQuiz backup.');
    const restoreBank = validateBank(data.bank || bank);
    const restoredLookup = new Map(restoreBank.questions.map(q => [q.id, q]));
    const validRows = a => Array.isArray(a.rows) && a.rows.length > 0 && a.rows.every(r => restoredLookup.has(r.id) && typeof r.correct === 'boolean' && typeof r.skipped === 'boolean' && (r.choice === null || Number.isInteger(r.choice) && r.choice >= 0 && r.choice < 4));
    if (data.attempts.some(a => !a || typeof a.id !== 'string' || !Number.isFinite(a.completedAt) || !Number.isFinite(a.duration) || !Number.isInteger(a.total) || a.total < 1 || !Number.isInteger(a.correct) || !Number.isInteger(a.wrong) || !Number.isInteger(a.skipped) || !Number.isInteger(a.percent) || a.percent < 0 || a.percent > 100 || !['practice', 'exam'].includes(a.mode) || !validRows(a) || a.total !== a.rows.length)) throw new Error('The backup contains invalid session data.');
    const stats = {};
    for (const [id, v] of Object.entries(data.stats)) if (restoredLookup.has(id) && v && Number.isInteger(v.attempts) && v.attempts >= 0 && Number.isInteger(v.correct) && v.correct >= 0 && v.correct <= v.attempts && typeof v.lastCorrect === 'boolean' && Number.isFinite(v.lastSeen)) stats[id] = v;
    confirmAction('Restore this backup?', 'This replaces the progress on this browser with your exported sessions, bookmarks, and question progress.', 'Restore progress', () => {
      state = { ...defaults(), theme: state.theme, bank: data.bank || state.bank, attempts: data.attempts.slice(0, 50), bookmarks: [...new Set(data.bookmarks.filter(id => restoredLookup.has(id)))], stats };
      applyBank(restoreBank); persist(); render(); toast('Your study progress has been restored.');
    });
  } catch (error) { toast(error.message || 'Could not read the backup.'); }
}
try {
  const response = await fetch('./data/questions.json');
  if (!response.ok) throw new Error('Could not load the question bank.');
  const demo = await response.json();
  try { applyBank(state.bank || demo); } catch { state = defaults(); applyBank(demo); }
  state.bookmarks = state.bookmarks.filter(id => lookup.has(id));
  if (!sessionIsValid(state.active, questions)) state.active = null;
  if (state.active?.mode === 'exam' && Date.now() >= state.active.deadline) complete(true);
  else render();
  setInterval(() => {
    // Timed exams continue while looking at another section or after refreshing.
    if (state.active?.mode === 'exam' && Date.now() >= state.active.deadline) { if ($('#confirm-dialog').open) $('#confirm-dialog').close('cancel'); complete(true); }
    else updateClock();
  }, 1000);
} catch (error) {
  $('#app').innerHTML = `<main class="loading"><h1>Your study space couldn’t load.</h1><p>${e(error.message)}</p><p>Refresh the page to try again.</p><button class="button primary" onclick="location.reload()">Try again</button></main>`;
}
