import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataPath = path.join(root, 'data', 'pocs.json');
const inPath = path.join(root, 'data', 'pocs.generated.json');

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : !!value;
}

async function main() {
  const raw = await fs.readFile(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const items = parsed.items || [];

  const generatedRaw = await fs.readFile(inPath, 'utf-8');
  const generated = JSON.parse(generatedRaw);
  const updates = generated.items || [];

  const byId = new Map(items.map((item) => [item.id, item]));

  let updatedCount = 0;
  updates.forEach((entry) => {
    const target = byId.get(entry.id);
    if (!target) return;

    if (hasValue(entry.title)) target.title = entry.title.trim();
    if (hasValue(entry.description)) target.description = entry.description.trim();
    if (hasValue(entry.tags)) target.tags = entry.tags;
    if (hasValue(entry.code)) target.code = entry.code;

    const ready = hasValue(target.title) && hasValue(target.description) && hasValue(target.tags);
    target.aiPending = !ready;
    updatedCount += 1;
  });

  parsed.items = items;
  await fs.writeFile(dataPath, JSON.stringify(parsed, null, 2), 'utf-8');
  console.log(`Applied updates to ${updatedCount} POCs.`);
}

main().catch((err) => {
  console.error('Failed to apply generated POCs:', err);
  process.exit(1);
});
