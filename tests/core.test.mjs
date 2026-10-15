import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBank, questionPool, createSession, sessionIsValid, scoreSession, recordResult, formatTime, shuffled, escapeHTML } from '../core.js';
const demo = JSON.parse(await readFile(new URL('../data/questions.json', import.meta.url), 'utf8'));
// Synthetic course fixtures keep personal question banks out of the repository.
const bank = { questions: Array.from({ length: 96 }, (_, i) => ({
  id: `w${Math.floor(i / 8) + 1}-q${i % 8 + 1}`, week: Math.floor(i / 8) + 1,
  number: i % 8 + 1, topic: 'Synthetic test material', question: `Synthetic question ${i + 1}?`,
  options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: i % 4,
})) };
const qs = bank.questions;
const settings = { mode: 'practice', count: 8, minutes: 10, shuffleQuestions: true, shuffleOptions: true };

test('bundled demo and synthetic multi-assignment banks are valid', () => {
  validateBank(demo); validateBank(bank);
  assert.equal(demo.questions.length, 3);
  assert.equal(bank.questions.length, 96);
  for (let week = 1; week <= 12; week++) assert.equal(qs.filter(q => q.week === week).length, 8);
});
test('question validation rejects duplicates and invalid answer keys', () => {
  assert.throws(() => validateBank({ questions: [qs[0], qs[0]] }));
  assert.throws(() => validateBank({ questions: [{ ...qs[0], answer: 4 }] }));
});
test('week and focused filters intersect, and last correct answer removes a missed question', () => {
  const progress = { bookmarks: [qs[0].id, qs[9].id], stats: { [qs[0].id]: { lastCorrect: false }, [qs[1].id]: { lastCorrect: true } } };
  assert.equal(questionPool(qs, { week: '1' }, progress).length, 8);
  assert.deepEqual(questionPool(qs, { week: '1', focus: 'bookmarked' }, progress).map(q => q.id), [qs[0].id]);
  assert.deepEqual(questionPool(qs, { focus: 'missed' }, progress).map(q => q.id), [qs[0].id]);
  progress.stats[qs[0].id].lastCorrect = true;
  assert.equal(questionPool(qs, { focus: 'missed' }, progress).length, 0);
});
test('shuffled options preserve source answer indices during scoring', () => {
  const s = createSession(qs.slice(0, 8), settings, 1000, () => .1);
  assert.equal(new Set(s.items.map(i => i.id)).size, 8);
  assert.notDeepEqual(s.items[0].order, [0, 1, 2, 3]);
  for (const item of s.items) {
    assert.deepEqual([...item.order].sort(), [0, 1, 2, 3]);
    const question = qs.find(q => q.id === item.id);
    const displayedCorrect = item.order.indexOf(question.answer);
    s.answers[item.id] = item.order[displayedCorrect];
  }
  assert.equal(scoreSession(s, qs, 3000).percent, 100);
});
test('wrong answers, skips, and correct zero index score correctly', () => {
  const s = createSession(qs.slice(0, 3), { ...settings, count: 3, shuffleQuestions: false }, 1000);
  s.answers[qs[0].id] = qs[0].answer;
  s.answers[qs[1].id] = (qs[1].answer + 1) % 4;
  const r = scoreSession(s, qs, 2000);
  assert.equal(r.correct, 1); assert.equal(r.wrong, 1); assert.equal(r.skipped, 1); assert.equal(r.percent, 33);
  assert.equal(r.rows[2].choice, null);
  const zero = qs.find(q => q.answer === 0);
  const z = createSession([zero], { ...settings, count: 1 }); z.answers[zero.id] = 0;
  assert.equal(scoreSession(z, qs).correct, 1);
});
test('time is based on a persistent deadline and elapsed duration caps at the deadline', () => {
  const s = createSession(qs, { ...settings, mode: 'exam', minutes: 2 }, 1000);
  assert.equal(s.deadline, 121000);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(restored.deadline, 121000);
  assert.equal(scoreSession(restored, qs, 200000).duration, 120000);
  assert.equal(formatTime(-1), '00:00'); assert.equal(formatTime(61000), '01:01');
});
test('recording is idempotent, keeps bookmarks, and changes latest correctness on a retry', () => {
  const s = createSession([qs[0]], { ...settings, count: 1 }, 1000);
  const initial = { active: s, bookmarks: [qs[1].id], attempts: [], stats: {} };
  const r = scoreSession(s, qs, 2000);
  const once = recordResult(initial, r), twice = recordResult(once, r);
  assert.equal(twice.attempts.length, 1); assert.equal(twice.stats[qs[0].id].attempts, 1);
  assert.equal(twice.stats[qs[0].id].lastCorrect, false); assert.deepEqual(twice.bookmarks, initial.bookmarks);
  assert.equal(twice.active, null);
  const retry = createSession([qs[0]], { ...settings, count: 1 }, 3000); retry.answers[qs[0].id] = qs[0].answer;
  const newer = recordResult(twice, scoreSession(retry, qs, 4000));
  assert.equal(newer.stats[qs[0].id].attempts, 2); assert.equal(newer.stats[qs[0].id].lastCorrect, true);
});
test('empty pools and invalid durations fail explicitly; counts clamp to available questions', () => {
  assert.throws(() => createSession([], settings));
  assert.throws(() => createSession(qs, { ...settings, count: 0 }));
  assert.throws(() => createSession(qs, { ...settings, mode: 'exam', minutes: 0 }));
  assert.equal(createSession(qs.slice(0, 2), { ...settings, count: 20 }).items.length, 2);
});
test('saved session validation rejects corrupted items and accepts JSON roundtrips', () => {
  const s = createSession(qs, settings);
  assert.equal(sessionIsValid(JSON.parse(JSON.stringify(s)), qs), true);
  assert.equal(sessionIsValid({ ...s, index: 99 }, qs), false);
  assert.equal(sessionIsValid({ ...s, items: [{ id: qs[0].id, order: [0, 1, 1, 3] }] }, qs), false);
  assert.equal(sessionIsValid({ ...s, items: [{ id: 'missing', order: [0, 1, 2, 3] }] }, qs), false);
});
test('shuffling does not mutate the bank and escaped content cannot inject markup', () => {
  const original = [1, 2, 3, 4]; shuffled(original, () => 0); assert.deepEqual(original, [1, 2, 3, 4]);
  assert.equal(escapeHTML('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
});
