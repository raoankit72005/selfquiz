/** Pure quiz rules shared by the UI and tests. Option indices always refer to the source bank. */
export function validateBank(bank) {
  if (!bank || !Array.isArray(bank.questions) || !bank.questions.length) throw new Error('The question bank is empty.');
  const ids = new Set();
  for (const q of bank.questions) {
    if (typeof q.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(q.id) || ids.has(q.id)) throw new Error('Question IDs must be unique.');
    ids.add(q.id);
    if (!Number.isInteger(q.week) || q.week < 1 || typeof q.question !== 'string' || !q.question.trim() ||
        !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim()) ||
        !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) throw new Error(`Invalid question: ${q.id}`);
  }
  return bank;
}
export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function questionPool(questions, { week = 'all', focus = 'all' } = {}, progress = {}) {
  return questions.filter(q => (week === 'all' || q.week === Number(week)) &&
    (focus === 'all' || (focus === 'bookmarked' && progress.bookmarks?.includes(q.id)) ||
    (focus === 'missed' && progress.stats?.[q.id]?.lastCorrect === false)));
}
export function createSession(pool, settings, now = Date.now(), random = Math.random) {
  if (!pool.length) throw new Error('No questions match these filters.');
  const requested = Number(settings.count);
  if (!Number.isInteger(requested) || requested < 1) throw new Error('Choose at least one question.');
  if (!['practice', 'exam'].includes(settings.mode)) throw new Error('Choose a quiz mode.');
  const minutes = Number(settings.minutes);
  if (settings.mode === 'exam' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) throw new Error('Exam time must be 1–240 minutes.');
  const selected = settings.shuffleQuestions ? shuffled(pool, random) : [...pool];
  return {
    id: `attempt-${now}-${Math.floor(random() * 1e9)}`, mode: settings.mode,
    startedAt: now, deadline: settings.mode === 'exam' ? now + minutes * 60000 : null,
    settings: { ...settings }, index: 0, answers: {}, checked: [], flags: [],
    items: selected.slice(0, Math.min(requested, pool.length)).map(q => ({ id: q.id,
      order: settings.shuffleOptions ? shuffled([0, 1, 2, 3], random) : [0, 1, 2, 3] }))
  };
}
export function sessionIsValid(session, questions) {
  if (!session || !['practice', 'exam'].includes(session.mode) || !Array.isArray(session.items) || !session.items.length) return false;
  const ids = new Set(questions.map(q => q.id));
  return Number.isInteger(session.index) && session.index >= 0 && session.index < session.items.length &&
    Number.isFinite(session.startedAt) && (session.mode !== 'exam' || Number.isFinite(session.deadline)) &&
    session.answers && typeof session.answers === 'object' && Array.isArray(session.checked) && Array.isArray(session.flags) &&
    new Set(session.items.map(i => i.id)).size === session.items.length &&
    session.items.every(i => ids.has(i.id) && Array.isArray(i.order) && i.order.length === 4 &&
      new Set(i.order).size === 4 && i.order.every(v => Number.isInteger(v) && v >= 0 && v < 4) &&
      (session.answers[i.id] === undefined || (Number.isInteger(session.answers[i.id]) && session.answers[i.id] >= 0 && session.answers[i.id] < 4)));
}
export function scoreSession(session, questions, now = Date.now()) {
  const lookup = new Map(questions.map(q => [q.id, q]));
  const rows = session.items.map(({ id }) => {
    const choice = session.answers[id];
    return { id, choice: choice ?? null, correct: choice === lookup.get(id).answer, skipped: choice === undefined };
  });
  const correct = rows.filter(r => r.correct).length;
  const skipped = rows.filter(r => r.skipped).length;
  return { id: session.id, mode: session.mode, completedAt: now,
    duration: Math.max(0, Math.min(now, session.deadline ?? now) - session.startedAt),
    total: rows.length, correct, skipped, wrong: rows.length - correct - skipped,
    percent: Math.round(100 * correct / rows.length), rows };
}
export function recordResult(progress, result) {
  // One attempt can only affect history/stats once (including refresh after time expiry).
  if (progress.attempts.some(a => a.id === result.id)) return progress;
  const stats = { ...progress.stats };
  for (const row of result.rows) {
    const old = stats[row.id] ?? { attempts: 0, correct: 0 };
    stats[row.id] = { attempts: old.attempts + 1, correct: old.correct + Number(row.correct),
      lastCorrect: row.correct, lastSeen: result.completedAt };
  }
  return { ...progress, active: null, stats, attempts: [result, ...progress.attempts].slice(0, 50) };
}
export function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
