import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as core from '../core.js';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const bank = JSON.parse(await readFile(new URL('../data/questions.json', import.meta.url), 'utf8'));
const KEY = 'selfquiz.hs169.v1';
async function setup(saved = null) {
  const dom = new JSDOM(html, { url: 'https://selfquiz.test/', runScripts: 'outside-only' });
  const w = dom.window;
  let now = 1000000, tick;
  w.__core = { ...core,
    createSession: (pool, settings) => core.createSession(pool, settings, now),
    scoreSession: (session, questions) => core.scoreSession(session, questions, now) };
  w.fetch = async () => ({ ok: true, json: async () => structuredClone(bank) });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function (value = '') { this.returnValue = value; this.removeAttribute('open'); this.onclose?.(new w.Event('close')); };
  w.setInterval = fn => { tick = fn; return 1; };
  w.Date.now = () => now;
  if (saved) w.localStorage.setItem(KEY, JSON.stringify(saved));
  const code = app.replace(/^import \{.*?\} from '\.\/core.js';/, 'const { validateBank, questionPool, createSession, sessionIsValid, scoreSession, recordResult, formatTime, escapeHTML: e } = window.__core;');
  w.eval(`window.__ready = (async () => { ${code}\n})();`);
  await w.__ready;
  const get = selector => { const el = w.document.querySelector(selector); assert.ok(el, `Missing: ${selector}`); return el; };
  return { dom, w, get, click: selector => get(selector).click(), saved: () => JSON.parse(w.localStorage.getItem(KEY)),
    set: (selector, value) => { const el = get(selector); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); },
    advance: ms => { now += ms; tick(); },
    submit: () => get('#setup-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })) };
}

test('practice flow checks shuffled source answer, saves a session, resumes, and reviews skips', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  assert.match(ui.get('h1').textContent, /progress/);
  ui.set('#count', '3'); ui.submit();
  let s = ui.saved().active;
  const q = bank.questions.find(q => q.id === s.items[0].id);
  ui.click(`[data-action="answer"][data-choice="${q.answer}"]`);
  ui.click('[data-action="check"]');
  assert.match(ui.get('.answer-feedback').textContent, /matches the assignment key/);
  assert.match(ui.get('.source-link').textContent, /demonstration answer key/);
  ui.click('[data-action="bookmark"]');
  ui.click('[data-action="flag"]');
  ui.click('[data-action="next"]');
  s = ui.saved(); assert.equal(s.active.index, 1); assert.equal(s.active.flags.length, 1);
  assert.ok(s.bookmarks.includes(q.id));
  const resumed = await setup(s); t.after(() => resumed.dom.window.close());
  resumed.click('[data-action="resume"]');
  assert.match(resumed.get('.quiz-progress-heading').textContent, /Question 2 of 3/);
  resumed.click('[data-action="finish"]');
  assert.match(resumed.get('#dialog-copy').textContent, /2 questions are unanswered/);
  resumed.get('#confirm-dialog').close('confirm');
  const result = resumed.saved().attempts[0];
  assert.equal(result.correct, 1); assert.equal(result.skipped, 2); assert.equal(result.total, 3);
  assert.equal(resumed.w.document.querySelectorAll('.review-card').length, 3);
  resumed.click('[data-action="retry"]');
  assert.equal(resumed.saved().active.items.length, 2);
});

test('timed exam hides feedback, allows answer changes, and auto-submits even off the quiz screen', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  ui.get('[name="mode"][value="exam"]').checked = true;
  ui.get('[name="mode"][value="exam"]').dispatchEvent(new ui.w.Event('change', { bubbles: true }));
  ui.set('#count', '2'); ui.set('#minutes', '1'); ui.submit();
  const s = ui.saved().active, id = s.items[0].id;
  ui.click('[data-action="answer"][data-choice="0"]');
  ui.click('[data-action="answer"][data-choice="1"]');
  assert.equal(ui.saved().active.answers[id], 1);
  assert.equal(ui.w.document.querySelector('.answer-feedback'), null);
  assert.equal(ui.w.document.querySelector('[data-action="check"]'), null);
  ui.click('[data-action="pause"]');
  assert.ok(ui.get('[data-action="resume"]'));
  ui.advance(61000);
  assert.equal(ui.saved().active, null);
  assert.equal(ui.saved().attempts[0].mode, 'exam');
  assert.equal(ui.saved().attempts[0].duration, 60000);
  assert.match(ui.get('#toast').textContent, /Time is up/);
});

test('expired exam submits on reload without resetting its deadline', async t => {
  const initial = { version: 1, bookmarks: [], attempts: [], stats: {}, preferences: {},
    active: core.createSession(bank.questions.slice(0, 2), { mode: 'exam', count: 2, minutes: 1 }, 1) };
  const ui = await setup(initial); t.after(() => ui.dom.window.close());
  assert.match(ui.get('#page-title').textContent, /step forward/);
  assert.equal(ui.saved().attempts[0].skipped, 2);
  assert.equal(ui.saved().active, null);
});

test('study search filters all fields, reveals answers, and bookmark removal updates the saved pool', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  ui.click('[data-view="study"]');
  assert.equal(ui.w.document.querySelectorAll('.study-card').length, 3);
  ui.set('#study-week', '1');
  assert.equal(ui.w.document.querySelectorAll('.study-card').length, 3);
  const search = ui.get('#study-search'); search.value = 'timer'; search.dispatchEvent(new ui.w.Event('input', { bubbles: true }));
  assert.equal(ui.w.document.querySelectorAll('.study-card').length, 1);
  ui.get('#reveal-all').checked = true; ui.get('#reveal-all').dispatchEvent(new ui.w.Event('change', { bubbles: true }));
  assert.ok(ui.get('details').open);
  ui.click('[data-action="bookmark"]');
  ui.click('[data-view="bookmarks"]');
  assert.equal(ui.w.document.querySelectorAll('.study-card').length, 1);
  ui.click('[data-action="bookmark"]');
  assert.equal(ui.saved().bookmarks.length, 0);
  assert.ok(ui.get('.empty-state'));
});

test('empty missed pool cannot start a quiz, and switching to one week clamps count', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  ui.set('#focus', 'missed');
  assert.equal(ui.get('.start-button').disabled, true);
  ui.set('#focus', 'all'); ui.set('#week', '1');
  assert.equal(ui.get('#count').max, '3'); assert.equal(ui.get('#count').value, '3');
  ui.click('[data-count="all"]'); ui.submit();
  assert.equal(ui.saved().active.items.length, 3);
  assert.ok(ui.saved().active.items.every(q => q.id.startsWith('demo-')));
});

test('dark theme persists and broken local storage does not crash interaction', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  ui.click('[data-action="theme"]');
  assert.equal(ui.w.document.documentElement.dataset.theme, 'dark');
  assert.equal(ui.saved().theme, 'dark');
  ui.w.Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); };
  ui.click('[data-action="theme"]');
  assert.equal(ui.w.document.documentElement.dataset.theme, 'light');
  assert.match(ui.get('#toast').textContent, /storage is unavailable/);
});

const customBank = { schemaVersion: 1, course: 'Synthetic exam', courseCode: 'TEST', institution: 'Test fixtures',
  questions: Array.from({ length: 96 }, (_, i) => ({ id: `test-${i}`, week: Math.floor(i / 8) + 1,
    number: i % 8 + 1, topic: 'Test topic', question: `Synthetic practice prompt ${i + 1}`,
    options: ['Choice one', 'Choice two', 'Choice three', 'Choice four'], answer: i % 4, sourcePage: 2 })) };
async function upload(ui, selector, value) {
  const input = ui.get(selector), text = JSON.stringify(value);
  Object.defineProperty(input, 'files', { configurable: true, value: [{ size: text.length, text: async () => text }] });
  input.dispatchEvent(new ui.w.Event('change', { bubbles: true }));
  await new Promise(resolve => setImmediate(resolve));
}

test('private bank import persists 96 questions, renders 12 assignments, and resumes after reload', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  await upload(ui, '#bank-file', customBank);
  assert.equal(ui.saved().bank.questions.length, 96);
  assert.equal(ui.w.document.querySelectorAll('#week option').length, 13);
  assert.equal(ui.w.document.querySelectorAll('.week-button').length, 12);
  ui.set('#week', '12'); ui.click('[data-count="all"]'); ui.submit();
  assert.equal(ui.saved().active.items.length, 8);
  const item = ui.saved().active.items[0], q = customBank.questions.find(q => q.id === item.id);
  ui.click(`[data-action="answer"][data-choice="${q.answer}"]`); ui.click('[data-action="check"]');
  assert.match(ui.get('.source-link').textContent, /Assignment 12 solution PDF · page 2/);
  const reload = await setup(ui.saved()); t.after(() => reload.dom.window.close());
  assert.equal(reload.w.document.querySelectorAll('.week-button').length, 12);
  reload.click('[data-action="resume"]');
  assert.match(reload.get('.answer-feedback').textContent, /matches/);
});

test('backup restoration restores its question bank along with history and bookmarks', async t => {
  const session = core.createSession(customBank.questions.slice(0, 2), { mode: 'practice', count: 2 }, 1);
  session.answers[session.items[0].id] = customBank.questions[0].answer;
  const savedResult = core.scoreSession(session, customBank.questions, 100);
  const backup = core.recordResult({ version: 1, bank: customBank, bookmarks: ['test-0'], stats: {}, attempts: [] }, savedResult);
  const ui = await setup(); t.after(() => ui.dom.window.close());
  ui.click('[data-view="history"]'); await upload(ui, '#restore-file', backup);
  ui.get('#confirm-dialog').close('confirm');
  assert.equal(ui.saved().bank.questions.length, 96);
  assert.equal(ui.saved().attempts[0].correct, 1);
  assert.deepEqual(ui.saved().bookmarks, ['test-0']);
  ui.click('[data-action="history-result"]');
  assert.equal(ui.w.document.querySelectorAll('.review-card').length, 2);
});

test('invalid imported answer keys are rejected without replacing the existing course', async t => {
  const ui = await setup(); t.after(() => ui.dom.window.close());
  await upload(ui, '#bank-file', { ...customBank, questions: [{ ...customBank.questions[0], answer: 10 }] });
  assert.match(ui.get('#toast').textContent, /Invalid question/);
  assert.equal(ui.w.document.querySelectorAll('.week-button').length, 1);
});
