import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await validate();
await rm(root + 'dist', { recursive: true, force: true });
await mkdir(root + 'dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'core.js', 'data', 'public']) {
  await cp(root + file, root + 'dist/' + file, { recursive: true });
}
console.log('Built dependency-free static app in dist/.');
