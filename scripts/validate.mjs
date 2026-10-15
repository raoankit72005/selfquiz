import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateBank } from '../core.js';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function validate() {
  const bank = validateBank(JSON.parse(await readFile(root + 'data/questions.json', 'utf8')));
  for (const file of ['index.html', 'app.js', 'core.js', 'styles.css']) await access(root + file);
  console.log(`Validated ${bank.questions.length} questions, unique IDs, answer indices, and application files.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await validate();
