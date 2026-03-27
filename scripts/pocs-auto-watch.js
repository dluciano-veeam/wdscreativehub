import { runAutoProcess } from './pocs-autoprocess.js';

const INTERVAL_MS = 5 * 60 * 1000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await runAutoProcess();
    const stamp = new Date().toISOString();
    if (result.processed > 0) {
      console.log(`[${stamp}] Auto-processed ${result.processed} pending POC(s).`);
    } else {
      console.log(`[${stamp}] No pending POCs.`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Auto-watch error:`, err.message || err);
  } finally {
    running = false;
  }
}

console.log('POC auto-watch started (every 5 minutes).');
tick();
setInterval(tick, INTERVAL_MS);
