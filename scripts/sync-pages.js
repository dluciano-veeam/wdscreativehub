import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataSrc = path.join(root, 'data', 'pocs.json');
const publicDataDir = path.join(root, 'public', 'data');
const publicDataDest = path.join(publicDataDir, 'pocs.json');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');

async function syncPages() {
  await fs.mkdir(publicDataDir, { recursive: true });
  await fs.copyFile(dataSrc, publicDataDest);

  await fs.mkdir(docsDir, { recursive: true });
  await fs.cp(publicDir, docsDir, { recursive: true, force: true });
}

syncPages().catch((err) => {
  console.error('pages:sync failed', err);
  process.exit(1);
});
