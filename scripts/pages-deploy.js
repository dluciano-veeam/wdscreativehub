import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: path.join(root, '..') });
}

try {
  run('node scripts/sync-pages.js');
  run('git add docs public/data/pocs.json data/pocs.json');

  try {
    run('git diff --cached --quiet');
    console.log('No changes to deploy.');
    process.exit(0);
  } catch {
    // changes staged
  }

  run('git commit -m \"Update pages\"');
  run('git push');
} catch (err) {
  console.error('pages:deploy failed');
  process.exit(1);
}
