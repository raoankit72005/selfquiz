# SelfQuiz

A calm personal exam practice app with practice quizzes, timed exams, a searchable study deck, bookmarks, and progress tracking. Inspired by the practice/study workflow at [selfquiz-three.vercel.app](https://selfquiz-three.vercel.app/), with an independent implementation and design.

The public repository contains **three demonstration questions**. Import a question-bank JSON to study your own exam material. Imported questions, answers, and progress are stored in your browser; the app does not upload them to a server or to GitHub.

## Features

- **Practice:** check an answer immediately, then continue at your own pace.
- **Timed exams:** correct answers stay hidden until submission. The exam submits automatically when its deadline passes. Each correct answer earns one point, with zero for wrong/skipped answers and no negative marking.
- **Focused sessions:** pick an assignment, bookmarked questions, or questions most recently missed/skipped; choose a count; independently shuffle questions and answer options.
- **Study deck:** search questions, options, and topics; filter by assignment; reveal answers individually or together.
- **Review:** see correct, incorrect, and skipped answers; retry missed questions. Imported source-page references help you locate answers in your own PDFs.
- **Saved sessions:** answers, flags, and bookmarks save as you go. A timed exam's deadline keeps running when you leave the quiz or refresh; if the page was closed, an expired exam submits when you reopen it.
- **Progress:** assignment coverage, latest correctness, and up to 50 completed sessions. Export and restore a JSON backup that includes an imported question bank.
- **Comfort:** mobile layouts, keyboard controls, light/dark appearance, accessible focus styles.

## Use your exam questions

1. Open the app and click **Import exam questions**.
2. Select your question-bank JSON. For this project, use the separately provided `NOC26_HS169_Exam_Questions.json` containing 96 questions from 12 assignments.
3. Pick an assignment or shuffle across the bank, then start a practice or timed session.

You only need to import once per browser. Changing banks resets the current bank's progress after a confirmation; export a backup first if you want to keep it. **My progress → Export progress** backs up your imported bank, bookmarks, and results. **Restore backup** restores them. Backups exclude unfinished sessions.

Progress and imported banks live in **localStorage on the current browser/device**. There is no login, cloud sync, analytics, or shared leaderboard. If storage is blocked or full, the app works for the current visit and displays a notice. Export before clearing browser data. Other people visiting the public URL see the demo until they import their own bank.

The original assignment solution PDFs and personal exam question bank are not included in this public repository.

## Run locally

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Use the server rather than opening `index.html` directly because the bank loads with `fetch`.

The app has no runtime npm dependencies. `jsdom` is only used for automated interaction tests.

## Deploy on Vercel

1. Choose **Add New → Project** in Vercel and import `raoankit72005/selfquiz`.
2. Keep the repository root directory and choose framework preset **Other**.
3. `vercel.json` supplies build command `npm run build` and output directory `dist`.
4. Deploy. No environment variables, database, or API key are required.

If an existing Vercel project is connected to this repository and branch, a push may trigger its configured deployment. This code does not create a Vercel project itself.

## Verify

```bash
npm test
npm run check
npm run build
```

Tests cover filtering, scoring after shuffling, skipped answers, persistent exam deadlines, saved-session validation, progress recording, question-bank imports, and UI interactions. Test course fixtures are synthetic. The static build validates question IDs and answer indices before creating `dist/`.

## Question-bank format

A bank contains metadata and a `questions` array:

```json
{
  "schemaVersion": 1,
  "course": "My course",
  "courseCode": "EXAM101",
  "institution": "My institution",
  "questions": [
    {
      "id": "w1-q1",
      "week": 1,
      "number": 1,
      "topic": "Topic name",
      "question": "Which option is correct?",
      "options": ["First", "Second", "Third", "Fourth"],
      "answer": 2,
      "sourcePage": 2
    }
  ]
}
```

`answer` is the **zero-based index in the original options array**. Shuffling changes display order without changing the key. Each question needs four nonempty options and exactly one answer. IDs must be unique and contain letters, digits, hyphens, or underscores. Use positive integer assignment numbers in `week`. Assignment selectors and progress cards adapt to the bank. `topic`, `number`, and `sourcePage` are optional descriptive fields. Source PDFs remain on your device; the app displays page references rather than publishing the documents.

Imports support up to 5,000 questions and a 2 MB JSON file. Banks should fit comfortably in browser storage alongside progress. Do not commit personal exam material to a public repository unless you intend to share it.

### Reproduce extraction for the supplied NOC26 HS169 PDFs

The optional extractor reads the correct options from bold PDF text. It requires 12 input solution files, four options per question, and exactly one bold answer. It fails rather than guessing if the structure does not match.

Place your copies in an ignored `input/` folder, with names `Assignment 1 Solution - NOC26 HS169.pdf` through `Assignment 12 Solution - NOC26 HS169.pdf`, then run:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/extract_questions.py
```

This creates the ignored `exam-questions.json` for local import. You can also specify a different folder and `--output` path. Answers follow the supplied assignment keys; the app does not independently fact-check course material or generate explanations.

## Keyboard

In a quiz, `1`–`4` select displayed options, `←` / `→` move between questions, and `Enter` checks/continues when focus is on the question area. Focused buttons retain normal keyboard behavior.

## Source layout

```text
index.html                 App shell and confirmation dialog
styles.css                 Responsive styles and themes
app.js                     Screens, local imports, timer, persistence
core.js                    Filtering, shuffling, scoring, progress rules
data/questions.json        Three public demonstration questions
scripts/                   Build, local server, validator, optional extractor
tests/                     Core rules and DOM interaction tests
vercel.json                Static Vercel configuration
```
