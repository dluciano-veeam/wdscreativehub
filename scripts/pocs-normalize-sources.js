import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeHtmlSource, normalizeProjectDirectory } from './source-normalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'pocs.json');
const POCS_DIR = path.join(ROOT, 'public', 'pocs');

async function run() {
  const raw = await fs.readFile(DATA_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const items = Array.isArray(data.items) ? data.items : [];

  let changedItems = 0;
  for (const item of items) {
    if (typeof item.code === 'string' && item.code.trim()) {
      const normalized = normalizeHtmlSource(item.code);
      if (normalized !== item.code) {
        item.code = normalized;
        changedItems += 1;
      }
    }
  }

  if (changedItems > 0) {
    await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  let changedProjects = 0;
  const entries = await fs.readdir(POCS_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('._')) continue;
    const projectDir = path.join(POCS_DIR, entry.name);
    const result = await normalizeProjectDirectory(projectDir);
    if (result.changedFiles > 0) changedProjects += 1;
  }

  console.log(
    `Normalized inline code for ${changedItems} item(s) and normalized ${changedProjects} project folder(s).`
  );
}

run().catch((err) => {
  console.error('pocs-normalize-sources failed:', err);
  process.exit(1);
});
