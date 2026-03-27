import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataPath = path.join(root, 'data', 'pocs.json');
const outPath = path.join(root, 'data', 'pocs.generated.json');

async function main() {
  const raw = await fs.readFile(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const items = parsed.items || [];
  const pending = items.filter((item) => item.aiPending);

  const payload = pending.map((item, idx) => ({
    draftNumber: idx + 1,
    id: item.id,
    brief: item.brief || '',
    briefImages: item.briefImages || [],
    title: '',
    description: '',
    tags: [],
    code: ''
  }));

  const out = {
    note: 'Fill title/description/tags/code for each pending POC, then run npm run pocs:apply',
    items: payload
  };

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Exported ${payload.length} pending POCs to ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error('Failed to export pending POCs:', err);
  process.exit(1);
});
