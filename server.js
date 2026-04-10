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
const MEDIA_INVENTORY_CLIENTS_PATH = path.join(__dirname, 'data', 'media-inventory-clients.json');
const MEDIA_INVENTORY_REPORTS_PATH = path.join(__dirname, 'data', 'media-inventory-reports.json');
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

async function loadMediaInventoryReports() {
  try {
    const raw = await fs.readFile(MEDIA_INVENTORY_REPORTS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const items = parsed && typeof parsed.items === 'object' && parsed.items
      ? parsed.items
      : {};
    return { items };
  } catch (err) {
    if (err.code === 'ENOENT') return { items: {} };
    throw err;
  }
}

async function saveMediaInventoryReports(data) {
  await fs.writeFile(MEDIA_INVENTORY_REPORTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
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

const MEDIA_TYPE_BY_EXT = new Map([
  ['png', 'png'],
  ['jpg', 'jpg'],
  ['jpeg', 'jpeg'],
  ['gif', 'gif'],
  ['webp', 'webp'],
  ['avif', 'avif'],
  ['svg', 'svg'],
  ['mp4', 'video'],
  ['webm', 'video'],
  ['mov', 'video'],
  ['m4v', 'video'],
  ['m3u8', 'video'],
  ['ogv', 'video'],
  ['lottie', 'lottie'],
  ['json', 'json'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['ogg', 'audio']
]);

const TRACKED_MEDIA_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'video', 'lottie', 'json', 'audio', 'other'];

function initTypeCounters() {
  return TRACKED_MEDIA_TYPES.reduce((acc, type) => {
    acc[type] = 0;
    return acc;
  }, {});
}

function toAbsoluteUrl(baseUrl, value) {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) {
    return '';
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return '';
  }
}

function normalizeForCrawl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    return parsed.toString();
  } catch {
    return '';
  }
}

function getApexDomain(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\.+|\.+$/g, '');
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('.');
}

function isInternalUrl(urlString, rootHost) {
  try {
    const parsed = new URL(urlString);
    if (!parsed.protocol.startsWith('http')) return false;
    const candidate = parsed.hostname.toLowerCase();
    const root = String(rootHost || '').toLowerCase();
    const rootApex = getApexDomain(root);
    const candidateApex = getApexDomain(candidate);
    return candidate === root || candidate.endsWith(`.${root}`) || (rootApex && candidateApex === rootApex);
  } catch {
    return false;
  }
}

function extractHrefCandidates(html, pageUrl) {
  const links = [];
  const hrefRegex = /<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/gi;
  let match = hrefRegex.exec(html);
  while (match) {
    const abs = toAbsoluteUrl(pageUrl, match[2]);
    if (abs) links.push(abs);
    match = hrefRegex.exec(html);
  }
  return links;
}

function getExtensionFromUrl(urlString) {
  try {
    const pathname = new URL(urlString).pathname.toLowerCase();
    const dot = pathname.lastIndexOf('.');
    if (dot === -1) return '';
    return pathname.slice(dot + 1);
  } catch {
    return '';
  }
}

function classifyMediaType(urlString, fallbackType = '') {
  const ext = getExtensionFromUrl(urlString);
  if (ext && MEDIA_TYPE_BY_EXT.has(ext)) {
    const mapped = MEDIA_TYPE_BY_EXT.get(ext);
    if (mapped === 'json' && fallbackType === 'lottie') return 'lottie';
    return mapped;
  }
  if (fallbackType) return fallbackType;
  return 'other';
}

function parseCssHiddenSelectors(cssText) {
  const selectors = new Set();
  if (!cssText) return selectors;
  const ruleRegex = /([^{}]+)\{[^{}]*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^{}]*\}/gi;
  let match = ruleRegex.exec(cssText);
  while (match) {
    const selectorGroup = match[1] || '';
    selectorGroup
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((selector) => selectors.add(selector));
    match = ruleRegex.exec(cssText);
  }
  return selectors;
}

function resolveVisibility({ tagName, attrs, hiddenSelectors, hasScriptHideHints }) {
  const reasons = [];
  const style = attrs.style || '';
  const classAttr = attrs.class || '';
  const idAttr = attrs.id || '';
  const classes = classAttr.split(/\s+/).filter(Boolean);

  if ('hidden' in attrs) reasons.push('hidden-attribute');
  if (/display\s*:\s*none/i.test(style)) reasons.push('inline-display-none');
  if (/visibility\s*:\s*hidden/i.test(style)) reasons.push('inline-visibility-hidden');
  if (/opacity\s*:\s*0(\D|$)/i.test(style)) reasons.push('inline-opacity-zero');

  const selectorsToCheck = [`.${classes[0] || ''}`, idAttr ? `#${idAttr}` : '', tagName];
  if (classes.length) {
    classes.forEach((cls) => selectorsToCheck.push(`.${cls}`));
  }

  selectorsToCheck
    .filter(Boolean)
    .forEach((candidate) => {
      if (hiddenSelectors.has(candidate)) {
        reasons.push(`css-hidden(${candidate})`);
      }
    });

  if (hasScriptHideHints && classes.some((cls) => /hidden|collapsed|sr-only/i.test(cls))) {
    reasons.push('script-hide-hint');
  }

  const visibility = reasons.length ? 'hidden' : 'visible';
  return { visibility, reasons };
}

function extractAttributes(rawAttrs = '') {
  const attrs = {};
  const attrRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match = attrRegex.exec(rawAttrs);
  while (match) {
    const key = (match[1] || '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
    match = attrRegex.exec(rawAttrs);
  }
  return attrs;
}

function extractMediaFromHtml({ html, pageUrl, hiddenSelectors }) {
  const media = [];
  const seen = new Set();
  const hasScriptHideHints = /(classList\.(add|toggle)\(['"]hidden['"]|style\.display\s*=\s*['"]none['"]|setAttribute\(['"]hidden['"])/i.test(html);
  const mediaTagRegex = /<(img|source|video|audio|object|embed)\b([^>]*)>/gi;
  let tagMatch = mediaTagRegex.exec(html);

  while (tagMatch) {
    const tagName = (tagMatch[1] || '').toLowerCase();
    const attrs = extractAttributes(tagMatch[2] || '');
    const primarySrc = attrs.src || attrs['data-src'] || attrs.poster || attrs.data || '';
    const absUrl = toAbsoluteUrl(pageUrl, primarySrc);
    if (absUrl) {
      const fallbackType = tagName === 'video' || tagName === 'source'
        ? (/\.(mp4|mov|webm|m3u8|m4v|ogv)(\?|$)/i.test(absUrl) ? 'video' : '')
        : tagName === 'audio'
          ? 'audio'
          : '';
      const type = classifyMediaType(absUrl, fallbackType);
      const visibilityState = resolveVisibility({ tagName, attrs, hiddenSelectors, hasScriptHideHints });
      const key = `${pageUrl}|${tagName}|${absUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        media.push({
          url: absUrl,
          type,
          extension: getExtensionFromUrl(absUrl) || type,
          element: tagName,
          visibility: visibilityState.visibility,
          hiddenReasons: visibilityState.reasons,
          via: 'html-tag',
          thumbnailUrl: type === 'video' ? (toAbsoluteUrl(pageUrl, attrs.poster || '') || '') : absUrl
        });
      }
    }
    tagMatch = mediaTagRegex.exec(html);
  }

  const styleAttrRegex = /\bstyle\s*=\s*(['"])(.*?)\1/gi;
  let styleMatch = styleAttrRegex.exec(html);
  while (styleMatch) {
    const styleValue = styleMatch[2] || '';
    const urlRegex = /url\(([^)]+)\)/gi;
    let urlMatch = urlRegex.exec(styleValue);
    while (urlMatch) {
      const cssUrl = toAbsoluteUrl(pageUrl, urlMatch[1]);
      if (cssUrl) {
        const type = classifyMediaType(cssUrl, '');
        if (type !== 'other') {
          const key = `${pageUrl}|style-attr|${cssUrl}`;
          if (!seen.has(key)) {
            seen.add(key);
            media.push({
              url: cssUrl,
              type,
              extension: getExtensionFromUrl(cssUrl) || type,
              element: 'style',
              visibility: /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i.test(styleValue) ? 'hidden' : 'visible',
              hiddenReasons: /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i.test(styleValue) ? ['inline-style-hidden'] : [],
              via: 'inline-style-url',
              thumbnailUrl: cssUrl
            });
          }
        }
      }
      urlMatch = urlRegex.exec(styleValue);
    }
    styleMatch = styleAttrRegex.exec(html);
  }

  return media;
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'WDSLabs-MediaInventory/1.0'
      }
    });
    if (!response.ok) return { ok: false, status: response.status, body: '' };
    const body = await response.text();
    return { ok: true, status: response.status, body, contentType: response.headers.get('content-type') || '' };
  } catch {
    return { ok: false, status: 0, body: '' };
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlMediaInventory({ rootUrl, maxPages = 25 }) {
  const root = new URL(rootUrl);
  const rootHost = root.hostname;
  const queue = [normalizeForCrawl(root.toString())].filter(Boolean);
  const visited = new Set();
  const pageReports = [];
  const totals = {
    pages: 0,
    media: 0,
    hiddenMedia: 0,
    byType: initTypeCounters()
  };

  while (queue.length && visited.size < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const pageRes = await fetchText(current);
    if (!pageRes.ok || !/text\/html|application\/xhtml\+xml/i.test(pageRes.contentType || 'text/html')) {
      continue;
    }

    const html = pageRes.body || '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim();

    const styleBlocks = [];
    const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let styleBlockMatch = styleRegex.exec(html);
    while (styleBlockMatch) {
      styleBlocks.push(styleBlockMatch[1] || '');
      styleBlockMatch = styleRegex.exec(html);
    }

    const cssHrefRegex = /<link\b[^>]*rel\s*=\s*(['"])[^'"]*stylesheet[^'"]*\1[^>]*href\s*=\s*(['"])(.*?)\2/gi;
    let cssHrefMatch = cssHrefRegex.exec(html);
    while (cssHrefMatch) {
      const cssUrl = toAbsoluteUrl(current, cssHrefMatch[3]);
      if (cssUrl && isInternalUrl(cssUrl, rootHost)) {
        const cssRes = await fetchText(cssUrl, 10000);
        if (cssRes.ok && /text\/css/i.test(cssRes.contentType || 'text/css')) {
          styleBlocks.push(cssRes.body || '');
        }
      }
      cssHrefMatch = cssHrefRegex.exec(html);
    }

    const hiddenSelectors = new Set(['[hidden]', '.hidden', '.visually-hidden', '.sr-only']);
    styleBlocks.forEach((cssText) => {
      parseCssHiddenSelectors(cssText).forEach((selector) => hiddenSelectors.add(selector));
    });

    const mediaItems = extractMediaFromHtml({
      html,
      pageUrl: current,
      hiddenSelectors
    });

    const byType = initTypeCounters();
    let hiddenMedia = 0;
    mediaItems.forEach((item) => {
      const type = TRACKED_MEDIA_TYPES.includes(item.type) ? item.type : 'other';
      byType[type] += 1;
      totals.byType[type] += 1;
      totals.media += 1;
      if (item.visibility === 'hidden') {
        hiddenMedia += 1;
        totals.hiddenMedia += 1;
      }
    });

    const pagePath = (() => {
      try {
        const parsed = new URL(current);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return current;
      }
    })();

    pageReports.push({
      url: current,
      path: pagePath || '/',
      title: title || pagePath || current,
      mediaCount: mediaItems.length,
      hiddenMediaCount: hiddenMedia,
      byType,
      media: mediaItems
    });

    const links = extractHrefCandidates(html, current);
    links.forEach((link) => {
      const normalized = normalizeForCrawl(link);
      if (!normalized) return;
      if (!isInternalUrl(normalized, rootHost)) return;
      if (visited.has(normalized)) return;
      if (queue.includes(normalized)) return;
      if (queue.length + visited.size >= maxPages * 3) return;
      queue.push(normalized);
    });
  }

  totals.pages = pageReports.length;
  pageReports.sort((a, b) => b.mediaCount - a.mediaCount);

  return {
    scannedAt: new Date().toISOString(),
    rootUrl: root.toString(),
    totals,
    pages: pageReports
  };
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

app.get('/api/media-inventory/clients', async (_req, res) => {
  const items = await loadItemsFile(MEDIA_INVENTORY_CLIENTS_PATH);
  res.json(items);
});

app.get('/api/media-inventory/reports/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: 'clientId is required.' });
    const reports = await loadMediaInventoryReports();
    const report = reports.items?.[clientId];
    if (!report) {
      return res.status(404).json({ error: 'No report found for this client yet.' });
    }
    return res.json(report);
  } catch (err) {
    console.error('Load media inventory report error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load media inventory report.' });
  }
});

app.post('/api/media-inventory/scan', async (req, res) => {
  try {
    const { rootUrl, maxPages, clientId } = req.body || {};
    if (!rootUrl) {
      return res.status(400).json({ error: 'rootUrl is required.' });
    }
    const parsed = new URL(rootUrl);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are supported.' });
    }
    const pageLimit = Math.max(1, Math.min(220, Number(maxPages) || 60));
    const report = await crawlMediaInventory({
      rootUrl: parsed.toString(),
      maxPages: pageLimit
    });
    const reportKey = (typeof clientId === 'string' && clientId.trim())
      ? clientId.trim()
      : `host:${parsed.hostname.toLowerCase()}`;
    const payload = {
      ...report,
      clientId: reportKey,
      persistedAt: new Date().toISOString()
    };
    const persisted = await loadMediaInventoryReports();
    persisted.items[reportKey] = payload;
    await saveMediaInventoryReports(persisted);
    res.json(payload);
  } catch (err) {
    console.error('Media Inventory scan error:', err);
    res.status(500).json({ error: err.message || 'Failed to scan website media inventory.' });
  }
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
