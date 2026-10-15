"""Rebuild the bank from original PDFs. Requires pdfplumber (pip install pdfplumber)."""
import argparse
import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
TOPICS = [
    'Understanding stress', 'Stress and physical health', 'Resilience and growth',
    'Coping with stress', 'Managing stress', 'Foundations of well-being',
    'Happiness and positive emotions', 'Adaptation and happiness',
    'Gratitude and kindness', 'Character strengths and flow',
    'Motivation and psychological needs', 'Meaning and life goals',
]

def extract(folder):
    questions = []
    for week in range(1, 13):
        path = folder / f'Assignment {week} Solution - NOC26 HS169.pdf'
        current, option = None, None
        week_questions = []
        with pdfplumber.open(path) as pdf:
            for page_number, page in enumerate(pdf.pages, 1):
                for line in page.extract_text_lines():
                    text = line['text'].strip()
                    question_match = re.match(r'^(\d+)\.\s+(.*)', text)
                    option_match = re.match(r'^([a-d])\.\s+(.*)', text)
                    if question_match:
                        current = {'id': f'w{week}-q{question_match[1]}', 'week': week,
                                   'number': int(question_match[1]), 'topic': TOPICS[week-1],
                                   'question': question_match[2], 'options': [],
                                   'source': f'sources/assignment-{week}.pdf#page={page_number}',
                                   'sourcePage': page_number}
                        week_questions.append(current)
                        option = None
                    elif option_match and current:
                        option = {'text': option_match[2], 'bold': 0, 'total': 0}
                        current['options'].append(option)
                    elif current and text and not text.startswith(('NPTEL', 'Psychology of', 'Assignment', 'Indian Institute', 'Note:', 'Correct answer')):
                        if option:
                            option['text'] += ' ' + text
                        else:
                            current['question'] += ' ' + text
                    else:
                        continue
                    if option:
                        chars = [c for c in line['chars'] if c['text'].strip()]
                        option['bold'] += sum('Bold' in c['fontname'] for c in chars)
                        option['total'] += len(chars)
        assert len(week_questions) == 8, (week, 'Expected 8 questions')
        for q in week_questions:
            assert len(q['options']) == 4, q
            correct = [i for i, o in enumerate(q['options']) if o['bold'] / max(o['total'], 1) > .6]
            assert len(correct) == 1, (q['id'], correct, q['options'])
            q['answer'] = correct[0]
            q['options'] = [o['text'] for o in q['options']]
            questions.append(q)
    return {'schemaVersion': 1, 'course': 'Psychology of Stress, Health and Well-Being',
            'courseCode': 'NOC26 HS169', 'institution': 'IIT Guwahati',
            'answerSource': 'Bold answer keys in the supplied assignment solution PDFs.',
            'questions': questions}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder', type=Path, nargs='?', default=ROOT / 'input')
    parser.add_argument('--output', type=Path, default=ROOT / 'exam-questions.json')
    args = parser.parse_args()
    # Original filenames are used for extraction; repository sources have stable URLs.
    if not (args.folder / 'Assignment 1 Solution - NOC26 HS169.pdf').exists():
        import tempfile, shutil
        with tempfile.TemporaryDirectory() as temp:
            for week in range(1, 13):
                shutil.copyfile(args.folder / f'assignment-{week}.pdf', Path(temp) / f'Assignment {week} Solution - NOC26 HS169.pdf')
            bank = extract(Path(temp))
    else:
        bank = extract(args.folder)
    args.output.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + '\n')
    print(f"Extracted and verified {len(bank['questions'])} questions across 12 assignments.")
