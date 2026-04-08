import 'dotenv/config';
import express from 'express';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import multer from 'multer';
import unzipper from 'unzipper';
import { normalizeHtmlSource, normalizeProjectDirectory } from './scripts/source-normalizer.js';

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'pocs.json');
const COMPETITORS_PATH = path.join(__dirname, 'data', 'competitors.json');
const COMP_UPDATES_PATH = path.join(__dirname, 'data', 'competitive-updates.json');
const THUMBS_DIR = path.join(__dirname, 'public', 'assets', 'thumbnails');
const UPLOADS_DIR = path.join(__dirname, 'public', 'assets', 'uploads');
const POCS_DIR = path.join(__dirname, 'public', 'pocs');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (err) {
      cb(err, UPLOADS_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 6 ? ext : '.png';
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${file.fieldname}-${stamp}${safeExt}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function nextAvailableSlug(baseSlug, existingIds) {
  const base = slugify(baseSlug) || 'poc';
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) {
    i += 1;
  }
  return `${base}-${i}`;
}

function maybeMultipart(req, res, next) {
  if (req.is('multipart/form-data')) {
    return upload.fields([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'briefImages', maxCount: 6 },
      { name: 'pocZip', maxCount: 1 }
    ])(req, res, next);
  }
  return next();
}

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

async function loadItemsFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.items || []);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
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

async function resolveZipEntry(destDir) {
  const queue = [destDir];
  let fallbackHtml = null;

  while (queue.length > 0) {
    const dir = queue.shift();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower === 'index.html') return fullPath;
      if (!fallbackHtml && lower.endsWith('.html')) {
        fallbackHtml = fullPath;
      }
    }
  }

  return fallbackHtml;
}

async function handleZipUpload(zipFile, finalId) {
  if (!zipFile) return null;
  await fs.mkdir(POCS_DIR, { recursive: true });
  const targetDir = path.join(POCS_DIR, finalId);
  await fs.mkdir(targetDir, { recursive: true });

  await createReadStream(zipFile.path)
    .pipe(unzipper.Extract({ path: targetDir }))
    .promise();

  await fs.unlink(zipFile.path);
  await normalizeProjectDirectory(targetDir);

  const entryPath = await resolveZipEntry(targetDir);
  if (!entryPath) {
    return null;
  }
  const relative = path.relative(path.join(__dirname, 'public'), entryPath);
  return `/${relative.replace(/\\/g, '/')}`;
}

app.get('/api/pocs', async (_req, res) => {
  const data = await loadData();
  res.json(data.items);
});

app.get('/api/competitors', async (_req, res) => {
  const items = await loadItemsFile(COMPETITORS_PATH);
  res.json(items);
});

app.get('/api/competitors/:id/updates', async (req, res) => {
  const { id } = req.params;
  const updates = await loadItemsFile(COMP_UPDATES_PATH);
  const filtered = updates
    .filter((item) => item.competitorId === id)
    .sort((a, b) => {
      const aTime = new Date(a.capturedAt || 0).getTime();
      const bTime = new Date(b.capturedAt || 0).getTime();
      return bTime - aTime;
    });
  res.json(filtered);
});

app.post('/api/pocs', maybeMultipart, async (req, res) => {
  try {
    const { title, description, tags, code, brief } = req.body;
    const zipFile = req.files?.pocZip?.[0];
    const safeTitle = title && title.trim() ? title.trim() : 'Untitled POC';
    const safeCode =
      !zipFile && code && code.trim()
        ? normalizeHtmlSource(code)
        : !zipFile
            ? normalizeHtmlSource(`<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>${safeTitle}</title>\n  <style>\n    body { margin: 0; font-family: \"ES Build\", \"Segoe UI\", sans-serif; display: grid; place-items: center; min-height: 100vh; background: #f7f9fa; }\n    .card { padding: 24px 28px; border-radius: 16px; background: #ffffff; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 12px 28px rgba(0,0,0,0.1); }\n  </style>\n</head>\n<body>\n  <div class=\"card\">${safeTitle}</div>\n</body>\n</html>`)
            : '';
    const data = await loadData();
    const existingIds = new Set((data.items || []).map((item) => item.id).filter(Boolean));
    const titleSlug = slugify(title || '');
    const briefSlug = slugify((brief || '').split(/\s+/).slice(0, 6).join(' '));
    const baseSlug = titleSlug || briefSlug || `poc-${Date.now().toString(36)}`;
    const finalId = nextAvailableSlug(baseSlug, existingIds);
    let thumbPath = await ensureThumb(finalId);
    if (req.files?.thumbnail?.[0]) {
      const file = req.files.thumbnail[0];
      thumbPath = `/assets/uploads/${file.filename}`;
    }
    const briefImages = (req.files?.briefImages || []).map(
      (file) => `/assets/uploads/${file.filename}`
    );
    const zipEntry = await handleZipUpload(zipFile, finalId);
    const item = {
      id: finalId,
      title: safeTitle,
      description: description || '',
      brief: brief || '',
      tags: Array.isArray(tags)
        ? tags
        : (tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : []),
      code: safeCode,
      thumbnail: thumbPath,
      briefImages,
      aiPending: !title || !description || !tags,
      entry: zipEntry || ''
    };
    data.items.unshift(item);
    await saveData(data);
    res.status(201).json(item);
  } catch (err) {
    console.error('Create POC error:', err);
    res.status(500).json({ error: err.message || 'Failed to create POC.' });
  }
});

app.put('/api/pocs/:id', maybeMultipart, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, tags, code, brief } = req.body;
    const zipFile = req.files?.pocZip?.[0];
    const data = await loadData();
    const idx = data.items.findIndex((item) => item.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });

    const current = data.items[idx];
    let thumbnail = current.thumbnail;
    if (req.files?.thumbnail?.[0]) {
      thumbnail = `/assets/uploads/${req.files.thumbnail[0].filename}`;
    }
    let briefImages = current.briefImages || [];
    if (req.files?.briefImages?.length) {
      briefImages = req.files.briefImages.map((file) => `/assets/uploads/${file.filename}`);
    }
    const zipEntry = await handleZipUpload(zipFile, id);
    const parsedTags = Array.isArray(tags)
      ? tags
      : (typeof tags === 'string' ? tags.split(',').map((t) => t.trim()).filter(Boolean) : current.tags);

    const updated = {
      ...current,
      id
    };
    if (typeof title === 'string') updated.title = title.trim();
    if (typeof description === 'string') updated.description = description.trim();
    if (typeof brief === 'string') updated.brief = brief;
    if (parsedTags) updated.tags = parsedTags;
    const incomingCode = typeof code === 'string' ? code.trim() : '';
    const currentCode = typeof current.code === 'string' ? current.code.trim() : '';

    if (!zipFile && incomingCode && incomingCode !== currentCode) {
      updated.code = normalizeHtmlSource(incomingCode);
    }
    if (zipEntry) {
      updated.entry = zipEntry;
    } else if (!zipFile && incomingCode && incomingCode !== currentCode) {
      updated.entry = '';
    }
    updated.thumbnail = thumbnail;
    updated.briefImages = briefImages;
    updated.aiPending = !updated.title || !updated.description || !updated.tags?.length;

    data.items[idx] = updated;
    await saveData(data);
    res.json(updated);
  } catch (err) {
    console.error('Update POC error:', err);
    res.status(500).json({ error: err.message || 'Failed to update POC.' });
  }
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

    res.json({
      code: normalizeHtmlSource(outputText)
    });
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

app.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Uploaded file is too large (max 25MB).' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected upload field.' });
  }
  console.error('Unhandled server error:', err);
  return res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Creative Hub running on http://localhost:${PORT}`);
});
