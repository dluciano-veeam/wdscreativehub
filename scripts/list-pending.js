import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataPath = path.join(root, 'data', 'pocs.json');

function clip(text, max = 80) {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function main() {
  const raw = await fs.readFile(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const items = parsed.items || [];
  const pending = items.filter((item) => item.aiPending);

  console.log(`Pending POCs: ${pending.length}`);
  if (!pending.length) return;

  pending.forEach((item, idx) => {
    const brief = clip(item.brief || '');
    const images = Array.isArray(item.briefImages) ? item.briefImages.length : 0;
    console.log(
      `Draft #${idx + 1} | ${item.id} | ${item.title || 'Untitled'} | brief: ${brief || '-'} | images: ${images}`
    );
  });
}

main().catch((err) => {
  console.error('Failed to list pending POCs:', err);
  process.exit(1);
});
