import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataSrc = path.join(root, 'data', 'pocs.json');
const competitorsSrc = path.join(root, 'data', 'competitors.json');
const compUpdatesSrc = path.join(root, 'data', 'competitive-updates.json');
const publicDataDir = path.join(root, 'public', 'data');
const publicDataDest = path.join(publicDataDir, 'pocs.json');
const competitorsDest = path.join(publicDataDir, 'competitors.json');
const compUpdatesDest = path.join(publicDataDir, 'competitive-updates.json');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');
const noJekyllSrc = path.join(publicDir, '.nojekyll');
const noJekyllDest = path.join(docsDir, '.nojekyll');

async function syncPages() {
  await fs.mkdir(publicDataDir, { recursive: true });
  await fs.copyFile(dataSrc, publicDataDest);
  await fs.copyFile(competitorsSrc, competitorsDest);
  await fs.copyFile(compUpdatesSrc, compUpdatesDest);

  await fs.mkdir(docsDir, { recursive: true });
  await fs.cp(publicDir, docsDir, { recursive: true, force: true });

  try {
    await fs.copyFile(noJekyllSrc, noJekyllDest);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

syncPages().catch((err) => {
  console.error('pages:sync failed', err);
  process.exit(1);
});
