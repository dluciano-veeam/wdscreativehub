import 'dotenv/config';
import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'pocs.json');
const THUMBS_DIR = path.join(__dirname, 'public', 'assets', 'thumbnails');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.items) return { items: [] };
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return { items: [] };
    throw err;
  }
}

async function saveData(data) {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function ensureThumb(id) {
  await fs.mkdir(THUMBS_DIR, { recursive: true });
  const fileName = `${id}.png`;
  const filePath = path.join(THUMBS_DIR, fileName);
  try {
    await fs.access(filePath);
  } catch {
    // 1x1 transparent PNG placeholder
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAA' +
      'AAC0lEQVR42mP8/x8AAwMCAO4BfQkAAAAASUVORK5CYII=';
    await fs.writeFile(filePath, Buffer.from(pngBase64, 'base64'));
  }
  return `/assets/thumbnails/${fileName}`;
}

app.get('/api/pocs', async (_req, res) => {
  const data = await loadData();
  res.json(data.items);
});

app.post('/api/pocs', async (req, res) => {
  const { title, description, tags, code, thumbnail } = req.body;
  if (!title || !code) {
    return res.status(400).json({ error: 'title and code are required' });
  }
  const data = await loadData();
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const finalId = `${id}-${Date.now().toString(36)}`;
  const thumbPath = thumbnail && thumbnail.trim() ? thumbnail : await ensureThumb(finalId);
  const item = {
    id: finalId,
    title,
    description: description || '',
    tags: Array.isArray(tags) ? tags : [],
    code,
    thumbnail: thumbPath
  };
  data.items.unshift(item);
  await saveData(data);
  res.status(201).json(item);
});

app.put('/api/pocs/:id', async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const idx = data.items.findIndex((item) => item.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const updated = {
    ...data.items[idx],
    ...req.body,
    id
  };
  data.items[idx] = updated;
  await saveData(data);
  res.json(updated);
});

app.delete('/api/pocs/:id', async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const nextItems = data.items.filter((item) => item.id !== id);
  if (nextItems.length === data.items.length) {
    return res.status(404).json({ error: 'not found' });
  }
  data.items = nextItems;
  await saveData(data);
  res.json({ ok: true });
});

app.post('/api/ai/adapt', async (req, res) => {
  try {
    const { prompt, code, styleBrief } = req.body;
    if (!code || !prompt) {
      return res.status(400).json({ error: 'prompt and code are required' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
    }

    const system = `You are a senior UI engineer. Transform the provided HTML/CSS/JS demo to match the Veeam look & feel.\n\nRules:\n- Keep the same functionality and structure.\n- Return a complete HTML document only (no markdown).\n- Use clean, modern enterprise styling.\n- Prefer CSS variables and keep code readable.\n- Do not add external libraries.\n- Keep it self-contained.\n- Base colors on Veeam palette (Viridis #00D15F, Pine #007F49, Dark Mineral #505861, Fog #F0F0F0).`;

    const user = `STYLE BRIEF:\n${styleBrief || 'Use a confident enterprise SaaS tone. Cool blue palette, crisp typography, generous spacing, subtle gradients, and clear CTAs.'}\n\nUSER REQUEST:\n${prompt}\n\nCURRENT CODE:\n${code}`;

    const response = await openai.responses.create({
      model: MODEL,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_output_tokens: 2400
    });

    const outputText =
      response.output_text ||
      response.output?.[0]?.content?.map((part) => part.text || '').join('') ||
      '';

    res.json({ code: outputText });
  } catch (err) {
    const status = err?.status || err?.response?.status || 500;
    const message =
      err?.message ||
      err?.response?.data?.error?.message ||
      'AI request failed';
    console.error('AI error:', message);
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Creative Hub running on http://localhost:${PORT}`);
});
