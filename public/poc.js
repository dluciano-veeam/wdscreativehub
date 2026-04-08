const detailTitle = document.getElementById('detailTitle');
const detailDescription = document.getElementById('detailDescription');
const detailTags = document.getElementById('detailTags');
const detailFrame = document.getElementById('detailFrame');
const detailEditBtn = document.getElementById('detailEditBtn');
const exportZipBtn = document.getElementById('exportZipBtn');
const detailCrumbCurrent = document.getElementById('detailCrumbCurrent');
const detailFullViewBtn = document.getElementById('detailFullViewBtn');
const detailExitViewBtn = document.getElementById('detailExitViewBtn');
const codeHtml = document.getElementById('codeHtml');
const codeCss = document.getElementById('codeCss');
const codeJs = document.getElementById('codeJs');
const perfFps = document.getElementById('perfFps');
const perfAssetSize = document.getElementById('perfAssetSize');
const perfHeap = document.getElementById('perfHeap');
const perfStatus = document.getElementById('perfStatus');
const perfFpsArc = document.getElementById('perfFpsArc');
const perfFpsNeedle = document.getElementById('perfFpsNeedle');
const perfFpsCap = document.getElementById('perfFpsCap');
const perfRamArc = document.getElementById('perfRamArc');
const perfRamNeedle = document.getElementById('perfRamNeedle');
const perfRamCap = document.getElementById('perfRamCap');
const perfScriptsBar = document.getElementById('perfScriptsBar');
const perfImagesBar = document.getElementById('perfImagesBar');
const perfScriptsValue = document.getElementById('perfScriptsValue');
const perfImagesValue = document.getElementById('perfImagesValue');
const perfFpsSparkline = document.getElementById('perfFpsSparkline');
const copyButtons = Array.from(document.querySelectorAll('.code-copy-btn'));
const panelToggleButtons = Array.from(document.querySelectorAll('.panel-toggle-btn'));
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const pocForm = document.getElementById('pocForm');
const pocTitle = document.getElementById('pocTitle');
const pocDescription = document.getElementById('pocDescription');
const pocThumbnail = document.getElementById('pocThumbnail');
const pocZip = document.getElementById('pocZip');
const pocTags = document.getElementById('pocTags');
const pocBrief = document.getElementById('pocBrief');
const pocBriefImages = document.getElementById('pocBriefImages');
const pocCode = document.getElementById('pocCode');
const modalNote = document.getElementById('modalNote');
const globalToast = document.getElementById('globalToast');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar = document.querySelector('.sidebar');
const DATA_FALLBACK = 'data/pocs.json?v=2';
const SITE_BASE_PATH = (() => {
  const isGitHubPages = window.location.hostname.endsWith('github.io');
  if (!isGitHubPages) return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length ? `/${parts[0]}` : '';
})();
let apiAvailable = true;
let currentItem = null;
let editOriginalCode = '';
let fullViewTimer = null;
let memoryGaugeTimer = null;
let fpsGaugeHandle = 0;
let fpsGaugeTimer = null;
let fpsGaugeWindow = null;
let fpsHistory = [];
const FPS_GRADIENT_STOPS = [
  { p: 0, c: '#d92f2f' },
  { p: 35, c: '#f2a41a' },
  { p: 55, c: '#00d15f' },
  { p: 100, c: '#00d15f' }
];
const RAM_GRADIENT_STOPS = [
  { p: 0, c: '#00d15f' },
  { p: 55, c: '#f2a41a' },
  { p: 100, c: '#d92f2f' }
];

function openDetailFullView() {
  if (fullViewTimer) clearTimeout(fullViewTimer);
  document.body.classList.remove('poc-leaving-fullview');
  document.body.classList.add('poc-entering-fullview');
  document.body.classList.add('poc-fullview');
  if (detailExitViewBtn) detailExitViewBtn.classList.remove('hidden');
  fullViewTimer = setTimeout(() => {
    document.body.classList.remove('poc-entering-fullview');
  }, 280);
}

function closeDetailFullView() {
  if (fullViewTimer) clearTimeout(fullViewTimer);
  document.body.classList.remove('poc-entering-fullview');
  document.body.classList.add('poc-leaving-fullview');
  fullViewTimer = setTimeout(() => {
    document.body.classList.remove('poc-fullview');
    document.body.classList.remove('poc-leaving-fullview');
    if (detailExitViewBtn) detailExitViewBtn.classList.add('hidden');
  }, 240);
}

function initMobileSidebar() {
  if (!mobileMenuToggle || !sidebarOverlay || !sidebar) return;

  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
  };

  mobileMenuToggle.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    mobileMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  sidebarOverlay.addEventListener('click', closeMenu);
  sidebar.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 960px)').matches) {
      closeMenu();
    }
  });
}

function initCollapsiblePanels() {
  panelToggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.perf-panel, .code-panel');
      if (!section) return;
      const willCollapse = !section.classList.contains('is-collapsed');
      section.classList.toggle('is-collapsed', willCollapse);
      btn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    });
  });
}

function withBasePath(value) {
  if (!value) return value;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/')) return `${SITE_BASE_PATH}${value}`;
  return value;
}

function injectTypographyIntoFrame() {
  try {
    const doc = detailFrame.contentDocument;
    if (!doc) return;
    if (doc.getElementById('veeam-font-override')) return;

    const style = doc.createElement('style');
    style.id = 'veeam-font-override';
    style.textContent = `
      @font-face {
        font-family: "ES Build";
        src: url("${withBasePath('/assets/fonts/esbuild/ESBuildNeutral-Regular.woff2')}") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "ES Build";
        src: url("${withBasePath('/assets/fonts/esbuild/ESBuildNeutral-Medium.woff2')}") format("woff2");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "ES Build";
        src: url("${withBasePath('/assets/fonts/esbuild/ESBuildNeutral-SemiBold.woff2')}") format("woff2");
        font-weight: 600;
        font-style: normal;
        font-display: swap;
      }
      html, body, button, input, textarea, select {
        font-family: "ES Build", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }
    `;

    const head = doc.head || doc.getElementsByTagName('head')[0];
    if (head) {
      head.appendChild(style);
    } else {
      doc.documentElement.appendChild(style);
    }
  } catch {
    // Ignore cross-origin or sandbox access errors.
  }
}

function resolveAssetPath(baseEntry, assetPath) {
  if (!assetPath) return '';
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://') || assetPath.startsWith('//')) {
    return assetPath;
  }
  if (assetPath.startsWith('/')) return assetPath;
  const baseDir = baseEntry && baseEntry.includes('/') ? baseEntry.slice(0, baseEntry.lastIndexOf('/') + 1) : '/';
  return new URL(assetPath, `${window.location.origin}${baseDir}`).pathname;
}

async function fetchTextSafe(url) {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(withBasePath(`${url}${sep}v=${Date.now()}`), { cache: 'no-store' });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

async function buildCodePanels(sourceHtml, entryPath) {
  const parser = new DOMParser();
  const sourceDoc = parser.parseFromString(sourceHtml || '', 'text/html');
  const htmlDoc = parser.parseFromString(sourceHtml || '', 'text/html');

  const cssParts = [];
  const jsParts = [];

  sourceDoc.querySelectorAll('style').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (text) cssParts.push(text);
  });
  htmlDoc.querySelectorAll('style').forEach((el) => el.remove());

  const styleLinks = Array.from(sourceDoc.querySelectorAll('link[rel="stylesheet"][href]'));
  for (const link of styleLinks) {
    const href = link.getAttribute('href') || '';
    const resolved = resolveAssetPath(entryPath, href);
    if (resolved && !resolved.startsWith('http')) {
      const cssText = await fetchTextSafe(resolved);
      if (cssText.trim()) cssParts.push(`/* ${href} */\n${cssText.trim()}`);
    }
  }

  const scripts = Array.from(sourceDoc.querySelectorAll('script'));
  for (const script of scripts) {
    const src = script.getAttribute('src');
    if (src) {
      const resolved = resolveAssetPath(entryPath, src);
      if (resolved && !resolved.startsWith('http')) {
        const jsText = await fetchTextSafe(resolved);
        if (jsText.trim()) jsParts.push(`// ${src}\n${jsText.trim()}`);
      }
      continue;
    }
    const text = (script.textContent || '').trim();
    if (text) jsParts.push(text);
  }
  htmlDoc.querySelectorAll('script:not([src])').forEach((el) => el.remove());

  const htmlOutput = htmlDoc.documentElement?.outerHTML?.trim() || 'Source unavailable.';
  const cssOutput = cssParts.length ? cssParts.join('\n\n') : 'No CSS source found.';
  const jsOutput = jsParts.length ? jsParts.join('\n\n') : 'No JS source found.';

  codeHtml.textContent = htmlOutput;
  codeCss.textContent = cssOutput;
  codeJs.textContent = jsOutput;
  if (window.Prism?.highlightElement) {
    window.Prism.highlightElement(codeHtml);
    window.Prism.highlightElement(codeCss);
    window.Prism.highlightElement(codeJs);
  }

  applyCodeLineNumbers(codeHtml, htmlOutput);
  applyCodeLineNumbers(codeCss, cssOutput);
  applyCodeLineNumbers(codeJs, jsOutput);
}

function applyCodeLineNumbers(codeEl, sourceText) {
  const pre = codeEl?.closest('pre');
  if (!pre) return;

  const lineCount = Math.max(1, String(sourceText || '').split('\n').length);
  let gutter = pre.querySelector('.code-line-numbers');
  if (!gutter) {
    gutter = document.createElement('div');
    gutter.className = 'code-line-numbers';
    pre.appendChild(gutter);
  }

  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= lineCount; i += 1) {
    const line = document.createElement('span');
    line.textContent = String(i);
    fragment.appendChild(line);
  }
  gutter.replaceChildren(fragment);

  pre.onscroll = null;
  gutter.style.transform = 'none';
}

function sanitizeFileName(value) {
  return (value || 'poc')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'poc';
}

function getExportPackageSlug(item) {
  const fromTitle = sanitizeFileName(item?.title || '');
  if (fromTitle && fromTitle !== 'poc' && fromTitle !== 'untitled') return fromTitle;

  const fromId = sanitizeFileName(item?.id || '');
  if (fromId && !fromId.startsWith('untitled-poc-')) return fromId;

  const entry = item?.entry || '';
  const lastSegment = sanitizeFileName(entry.split('/').filter(Boolean).slice(-2, -1)[0] || '');
  return lastSegment && lastSegment !== 'poc' ? lastSegment : 'poc';
}

function isExternalOrDataPath(value) {
  return !value || /^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');
}

function toProjectRelativePath(pathname) {
  if (!pathname) return '';
  if (SITE_BASE_PATH && pathname.startsWith(`${SITE_BASE_PATH}/`)) {
    return pathname.slice(SITE_BASE_PATH.length + 1);
  }
  return pathname.startsWith('/') ? pathname.slice(1) : pathname;
}

async function fetchBinarySafe(url) {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(withBasePath(`${url}${sep}v=${Date.now()}`), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function formatKB(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((ch) => `${ch}${ch}`).join('')
    : clean;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function gradientColorAt(stops, pct) {
  const t = clamp(pct, 0, 100);
  if (!Array.isArray(stops) || stops.length === 0) return '#0b7d35';
  if (t <= stops[0].p) return stops[0].c;
  for (let i = 1; i < stops.length; i += 1) {
    const prev = stops[i - 1];
    const curr = stops[i];
    if (t <= curr.p) {
      const span = curr.p - prev.p || 1;
      const alpha = (t - prev.p) / span;
      const a = hexToRgb(prev.c);
      const b = hexToRgb(curr.c);
      return rgbToHex({
        r: a.r + (b.r - a.r) * alpha,
        g: a.g + (b.g - a.g) * alpha,
        b: a.b + (b.b - a.b) * alpha
      });
    }
  }
  return stops[stops.length - 1].c;
}

function setNeedleRotation(needleEl, degrees) {
  if (!needleEl) return;
  needleEl.setAttribute('transform', `rotate(${degrees} 60 60)`);
}

function setNeedleColor(needleEl, capEl, color) {
  if (needleEl) needleEl.style.stroke = color;
  if (capEl) capEl.style.fill = color;
}

function setGaugeArc(arcEl, pct, color) {
  if (!arcEl) return;
  arcEl.style.strokeDasharray = `${clamp(pct, 0, 100)} 100`;
  if (color) arcEl.style.stroke = color;
}

function updateFpsSparkline(fpsValue) {
  if (!perfFpsSparkline) return;
  fpsHistory.push(clamp(fpsValue, 0, 120));
  if (fpsHistory.length > 28) fpsHistory = fpsHistory.slice(-28);
  const svg = perfFpsSparkline.ownerSVGElement;
  const vb = svg?.viewBox?.baseVal;
  const width = vb?.width || 120;
  const height = vb?.height || 22;
  const maxY = height - 2;
  const minY = 2;
  const points = fpsHistory.map((value, idx) => {
    const x = (idx / 27) * width;
    const y = maxY - (clamp(value, 0, 60) / 60) * (maxY - minY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  perfFpsSparkline.setAttribute('points', points.join(' '));
}

function updateFpsGaugeVisual(fpsValue) {
  const safeFps = clamp(Number(fpsValue) || 0, 0, 120);
  const pct = clamp((safeFps / 60) * 100, 0, 100);
  setGaugeArc(perfFpsArc, pct);
  setNeedleRotation(perfFpsNeedle, -90 + (pct / 100) * 180);
  const statusColor = gradientColorAt(FPS_GRADIENT_STOPS, pct);
  setNeedleColor(perfFpsNeedle, perfFpsCap, statusColor);
  if (perfFps) perfFps.style.color = statusColor;
}

function readIframeMemory() {
  try {
    const memory = detailFrame?.contentWindow?.performance?.memory;
    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return { supported: false };
    return {
      supported: true,
      used: memory.usedJSHeapSize,
      total: Number.isFinite(memory.totalJSHeapSize) ? memory.totalJSHeapSize : 0
    };
  } catch {
    return { supported: false };
  }
}

function readIframeHeapText() {
  const memory = readIframeMemory();
  if (!memory.supported) return 'N/A';
  return `${(memory.used / (1024 * 1024)).toFixed(2)} MB`;
}

function updateRamGaugeVisual() {
  const memory = readIframeMemory();
  if (!memory.supported) {
    setGaugeArc(perfRamArc, 0);
    setNeedleRotation(perfRamNeedle, -90);
    setNeedleColor(perfRamNeedle, perfRamCap, '#8a94a4');
    if (perfHeap) perfHeap.style.color = '#8a94a4';
    if (perfHeap) {
      perfHeap.classList.remove('perf-low', 'perf-med', 'perf-ok');
    }
    return;
  }
  const usedPct = memory.total > 0 ? clamp((memory.used / memory.total) * 100, 0, 100) : 0;
  setGaugeArc(perfRamArc, usedPct);
  setNeedleRotation(perfRamNeedle, -90 + (usedPct / 100) * 180);
  const statusColor = gradientColorAt(RAM_GRADIENT_STOPS, usedPct);
  setNeedleColor(perfRamNeedle, perfRamCap, statusColor);
  if (perfHeap) perfHeap.style.color = statusColor;
  if (perfHeap) {
    perfHeap.classList.remove('perf-low', 'perf-med', 'perf-ok');
    if (usedPct > 85) perfHeap.classList.add('perf-low');
    else if (usedPct > 70) perfHeap.classList.add('perf-med');
    else perfHeap.classList.add('perf-ok');
  }
}

function updateSizeBars(sizeBreakdown) {
  const scripts = sizeBreakdown?.scripts || 0;
  const images = sizeBreakdown?.images || 0;
  const total = scripts + images;
  const scriptsPct = total > 0 ? (scripts / total) * 100 : 0;
  const imagesPct = total > 0 ? (images / total) * 100 : 0;
  if (perfScriptsBar) perfScriptsBar.style.width = `${scriptsPct.toFixed(1)}%`;
  if (perfImagesBar) perfImagesBar.style.width = `${imagesPct.toFixed(1)}%`;
  if (perfScriptsValue) perfScriptsValue.textContent = formatKB(scripts);
  if (perfImagesValue) perfImagesValue.textContent = formatKB(images);
}

async function calculatePocPackageSizeBytes(item, htmlSource) {
  if (!item) return { scripts: 0, images: 0 };
  const encoder = new TextEncoder();
  const parsed = new DOMParser().parseFromString(htmlSource || '', 'text/html');
  let scriptBytes = 0;
  let imageBytes = 0;

  parsed.querySelectorAll('script:not([src])').forEach((node) => {
    const inline = (node.textContent || '').trim();
    if (inline) {
      scriptBytes += encoder.encode(inline).byteLength;
    }
  });

  if (!item.entry) {
    return { scripts: scriptBytes, images: imageBytes };
  }

  const assets = collectAssetCandidatesFromHtml(htmlSource, item.entry || '/index.html');
  const queue = Array.from(assets);
  const added = new Set();

  while (queue.length) {
    const absolutePath = queue.shift();
    if (!absolutePath || added.has(absolutePath)) continue;
    added.add(absolutePath);

    const data = await fetchBinarySafe(absolutePath);
    if (!data) continue;
    const relPath = toProjectRelativePath(absolutePath).toLowerCase();
    const isScript = relPath.endsWith('.js') || relPath.endsWith('.mjs');
    const isImage = /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|tiff?)$/i.test(relPath);

    if (isScript) scriptBytes += data.byteLength;
    if (isImage) imageBytes += data.byteLength;

    if (absolutePath.endsWith('.css')) {
      const cssText = new TextDecoder().decode(data);
      const nestedRefs = collectUrlsFromCss(cssText, absolutePath);
      nestedRefs.forEach((ref) => {
        if (!added.has(ref)) queue.push(ref);
      });
    }
  }

  return { scripts: scriptBytes, images: imageBytes };
}

function stopFpsGauge() {
  if (fpsGaugeHandle && fpsGaugeWindow?.cancelAnimationFrame) {
    fpsGaugeWindow.cancelAnimationFrame(fpsGaugeHandle);
  }
  if (fpsGaugeTimer) {
    clearInterval(fpsGaugeTimer);
    fpsGaugeTimer = null;
  }
  fpsGaugeHandle = 0;
  fpsGaugeWindow = null;
  fpsHistory = [];
  if (perfFpsSparkline) perfFpsSparkline.setAttribute('points', '');
}

function startFpsGauge() {
  stopFpsGauge();
  if (!perfFps) return;

  let targetWindow = null;
  try {
    targetWindow = detailFrame?.contentWindow || null;
  } catch {
    targetWindow = null;
  }
  if (!targetWindow || !targetWindow.requestAnimationFrame) {
    perfFps.textContent = 'N/A';
    perfFps.classList.remove('perf-low');
    updateFpsGaugeVisual(0);
    return;
  }

  fpsGaugeWindow = targetWindow;
  let frameCount = 0;
  const tick = () => {
    frameCount += 1;
    fpsGaugeHandle = fpsGaugeWindow.requestAnimationFrame(tick);
  };
  fpsGaugeHandle = fpsGaugeWindow.requestAnimationFrame(tick);

  fpsGaugeTimer = setInterval(() => {
    const fpsValue = frameCount;
    perfFps.textContent = `${fpsValue} fps`;
    perfFps.classList.remove('perf-low', 'perf-med', 'perf-ok');
    if (fpsValue < 20) perfFps.classList.add('perf-low');
    else if (fpsValue < 30) perfFps.classList.add('perf-med');
    else perfFps.classList.add('perf-ok');
    updateFpsGaugeVisual(fpsValue);
    updateFpsSparkline(fpsValue);
    frameCount = 0;
  }, 1000);
}

function handleDetailFrameLoad() {
  injectTypographyIntoFrame();
  if (perfHeap) {
    perfHeap.textContent = readIframeHeapText();
  }
  // Re-arm FPS measurement after iframe navigation; previous RAF callbacks
  // may be dropped when the frame swaps documents.
  startFpsGauge();
}

async function updatePerformanceGauge(item, htmlSource) {
  if (!perfAssetSize || !perfHeap || !perfStatus || !perfFps) return;
  if (memoryGaugeTimer) {
    clearInterval(memoryGaugeTimer);
    memoryGaugeTimer = null;
  }
  stopFpsGauge();

  perfFps.textContent = 'Measuring...';
  perfFps.style.color = '#00110a';
  perfFps.classList.remove('perf-low', 'perf-med', 'perf-ok');
  perfAssetSize.textContent = 'Calculating...';
  perfHeap.textContent = 'Checking...';
  perfHeap.style.color = '#00110a';
  perfStatus.textContent = 'Estimating metrics for this POC...';
  updateFpsGaugeVisual(0);
  updateRamGaugeVisual();

  const sizeBreakdown = await calculatePocPackageSizeBytes(item, htmlSource);
  perfAssetSize.textContent = `${formatKB(sizeBreakdown.scripts + sizeBreakdown.images)} total`;
  updateSizeBars(sizeBreakdown);
  perfHeap.textContent = readIframeHeapText();
  updateRamGaugeVisual();
  startFpsGauge();
  perfStatus.textContent = perfHeap.textContent === 'N/A'
    ? 'RAM check is available only in Chrome-based browsers.'
    : 'Live heap value updates every 3 seconds.';

  memoryGaugeTimer = setInterval(() => {
    if (document.hidden) return;
    perfHeap.textContent = readIframeHeapText();
    updateRamGaugeVisual();
  }, 3000);
}

function collectAssetCandidatesFromHtml(html, entryPath) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const refs = new Set();
  const selectors = [
    'link[href]',
    'script[src]',
    'img[src]',
    'source[src]',
    'video[src]',
    'audio[src]'
  ];
  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => {
      const attr = selector.includes('href') ? 'href' : 'src';
      const raw = node.getAttribute(attr) || '';
      if (isExternalOrDataPath(raw)) return;
      const resolved = resolveAssetPath(entryPath, raw);
      if (!isExternalOrDataPath(resolved)) refs.add(resolved);
    });
  });
  return refs;
}

function collectUrlsFromCss(cssText, cssFilePath) {
  const refs = new Set();
  const regex = /url\(([^)]+)\)/g;
  let match = regex.exec(cssText);
  while (match) {
    const raw = (match[1] || '').trim().replace(/^['"]|['"]$/g, '');
    if (!isExternalOrDataPath(raw)) {
      const resolved = resolveAssetPath(cssFilePath, raw);
      if (!isExternalOrDataPath(resolved)) refs.add(resolved);
    }
    match = regex.exec(cssText);
  }
  return refs;
}

function splitInlineAssetsFromHtml(sourceHtml, entryPath) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(sourceHtml || '', 'text/html');
  const inlineCss = [];
  const inlineJs = [];

  doc.querySelectorAll('style').forEach((node) => {
    const text = (node.textContent || '').trim();
    if (text) inlineCss.push(text);
    node.remove();
  });

  doc.querySelectorAll('script:not([src])').forEach((node) => {
    const text = (node.textContent || '').trim();
    if (text) inlineJs.push(text);
    node.remove();
  });

  const hasHead = !!doc.head;
  const hasBody = !!doc.body;
  if (inlineCss.length) {
    const cssRef = './wdslabs-inline.css';
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', cssRef);
    if (hasHead) {
      doc.head.appendChild(link);
    } else {
      doc.documentElement.appendChild(link);
    }
  }

  if (inlineJs.length) {
    const jsRef = './wdslabs-inline.js';
    const script = doc.createElement('script');
    script.setAttribute('src', jsRef);
    if (hasBody) {
      doc.body.appendChild(script);
    } else {
      doc.documentElement.appendChild(script);
    }
  }

  const baseEntryRel = toProjectRelativePath(entryPath || 'index.html');
  const baseDir = baseEntryRel.includes('/') ? baseEntryRel.slice(0, baseEntryRel.lastIndexOf('/') + 1) : '';

  return {
    html: `<!doctype html>\n${doc.documentElement.outerHTML}`,
    inlineCssText: inlineCss.join('\n\n').trim(),
    inlineJsText: inlineJs.join('\n\n').trim(),
    inlineCssPath: `${baseDir}wdslabs-inline.css`,
    inlineJsPath: `${baseDir}wdslabs-inline.js`
  };
}

function getExportBaseDir(entryPath) {
  const relEntry = toProjectRelativePath(entryPath || 'index.html');
  const entryDir = relEntry.includes('/') ? relEntry.slice(0, relEntry.lastIndexOf('/') + 1) : '';
  const distMarker = '/dist/';
  const distIdx = entryDir.lastIndexOf(distMarker);
  if (distIdx >= 0) return entryDir.slice(0, distIdx + distMarker.length);
  return entryDir;
}

function toExportRelativePath(absolutePath, exportBaseDir) {
  const rel = toProjectRelativePath(absolutePath);
  if (exportBaseDir && rel.startsWith(exportBaseDir)) {
    return rel.slice(exportBaseDir.length) || 'index.html';
  }
  const clean = rel.split('/').pop() || rel;
  return clean || 'asset';
}

async function exportCurrentPocZip() {
  if (!currentItem) return;
  if (!window.JSZip) {
    alert('ZIP export dependency not loaded. Please refresh and try again.');
    return;
  }

  const item = currentItem;
  const zip = new window.JSZip();
  const rootFolder = getExportPackageSlug(item);
  const base = zip.folder(rootFolder);
  if (!base) return;

  const htmlSource = item.entry ? await fetchTextSafe(item.entry) : (item.code || '');
  if (!htmlSource.trim()) {
    alert('No source available to export for this POC.');
    return;
  }

  const split = splitInlineAssetsFromHtml(htmlSource, item.entry || '/index.html');
  const exportBaseDir = getExportBaseDir(item.entry || '/index.html');

  if (item.entry) {
    const entryRel = toExportRelativePath(item.entry, exportBaseDir);
    base.file(entryRel, split.html);
  } else {
    base.file('index.html', split.html);
  }

  if (split.inlineCssText) {
    base.file(toExportRelativePath(split.inlineCssPath, exportBaseDir), split.inlineCssText);
  }
  if (split.inlineJsText) {
    base.file(toExportRelativePath(split.inlineJsPath, exportBaseDir), split.inlineJsText);
  }

  const assets = collectAssetCandidatesFromHtml(split.html, item.entry || '/index.html');
  const queue = Array.from(assets);
  const added = new Set();

  while (queue.length) {
    const absolutePath = queue.shift();
    if (!absolutePath || added.has(absolutePath)) continue;
    added.add(absolutePath);

    const data = await fetchBinarySafe(absolutePath);
    if (!data) continue;
    const rel = toExportRelativePath(absolutePath, exportBaseDir);
    base.file(rel, data);

    if (rel.endsWith('.css')) {
      const cssText = new TextDecoder().decode(data);
      const nestedRefs = collectUrlsFromCss(cssText, absolutePath);
      nestedRefs.forEach((ref) => {
        if (!added.has(ref)) queue.push(ref);
      });
    }
  }

  const readme = [
    '# Exported POC',
    '',
    `Title: ${item.title || item.id}`,
    `ID: ${item.id}`,
    '',
    'Run with a local static server from this ZIP root:',
    'npx serve .',
    '',
    `Open: ${item.entry ? toExportRelativePath(item.entry, exportBaseDir) : 'index.html'}`
  ].join('\n');
  base.file('README.txt', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${sanitizeFileName(item.title || item.id)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

document.body.classList.add('page-ready');
detailFrame.addEventListener('load', handleDetailFrameLoad);

copyButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const targetId = btn.getAttribute('data-copy-target');
    const target = document.getElementById(targetId);
    if (!target) return;
    const text = target.textContent || '';
    const label = btn.querySelector('span');
    const setLabel = (value) => {
      if (label) label.textContent = value;
    };
    try {
      await navigator.clipboard.writeText(text);
      const prev = label ? label.textContent : 'Copy';
      setLabel('Copied');
      setTimeout(() => {
        setLabel(prev || 'Copy');
      }, 1200);
    } catch {
      setLabel('Error');
      setTimeout(() => {
        setLabel('Copy');
      }, 1200);
    }
  });
});

async function fetchItems() {
  try {
    const res = await fetch(withBasePath('/api/pocs'));
    if (!res.ok) {
      throw new Error('API not available');
    }
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items || []);
  } catch (err) {
    apiAvailable = false;
    const res = await fetch(DATA_FALLBACK);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items || []);
  }
}

function openModal() {
  modalOverlay.classList.remove('hidden');
  modalNote.textContent = '';
  if (pocZip) pocZip.value = '';
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalNote.textContent = '';
}

function showSuccessToast(message) {
  if (!globalToast) return;
  globalToast.textContent = message;
  globalToast.classList.remove('hidden');
  void globalToast.offsetWidth;
  globalToast.classList.add('visible');
  setTimeout(() => {
    globalToast.classList.remove('visible');
    setTimeout(() => globalToast.classList.add('hidden'), 220);
  }, 2200);
}

function openEditModal(item) {
  if (!item) return;
  pocTitle.value = item.title || '';
  pocDescription.value = item.description || '';
  pocTags.value = Array.isArray(item.tags) ? item.tags.join(', ') : '';
  pocBrief.value = item.brief || '';
  pocCode.value = item.code || '';
  editOriginalCode = (item.code || '').trim();
  openModal();
}

async function loadDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    detailTitle.textContent = 'POC not found';
    return;
  }

  const items = await fetchItems();
  const item = items.find((poc) => poc.id === id);
  currentItem = item || null;

  if (!item) {
    detailTitle.textContent = 'POC not found';
    detailDescription.textContent = 'Return to the gallery and choose another POC.';
    return;
  }

  if (apiAvailable) {
    detailEditBtn.classList.remove('ghost');
    detailEditBtn.removeAttribute('aria-disabled');
    detailEditBtn.removeAttribute('title');
  } else {
    detailEditBtn.classList.add('ghost');
    detailEditBtn.setAttribute('aria-disabled', 'true');
    detailEditBtn.title = 'Edit is available only in local mode with API.';
  }

  detailTitle.textContent = item.title;
  if (detailCrumbCurrent) {
    detailCrumbCurrent.textContent = item.title;
  }
  detailDescription.textContent = item.description || '';
  detailTags.innerHTML = '';
  item.tags.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    detailTags.appendChild(chip);
  });
  async function refreshSourcePanels() {
    const sourceHtml = item.entry ? await fetchTextSafe(item.entry) : (item.code || '');
    await buildCodePanels(sourceHtml, item.entry || '');
    await updatePerformanceGauge(item, sourceHtml);
  }

  if (item.entry) {
    detailFrame.removeAttribute('srcdoc');
    const sep = item.entry.includes('?') ? '&' : '?';
    detailFrame.src = withBasePath(`${item.entry}${sep}v=${Date.now()}`);
  } else {
    detailFrame.srcdoc = item.code || '';
  }

  await refreshSourcePanels();
}

if (exportZipBtn) {
  exportZipBtn.addEventListener('click', () => {
    exportCurrentPocZip();
  });
}

if (detailEditBtn) {
  detailEditBtn.addEventListener('click', (event) => {
    event.preventDefault();
    if (!apiAvailable || !currentItem) return;
    openEditModal(currentItem);
  });
}

if (detailFullViewBtn) {
  detailFullViewBtn.addEventListener('click', openDetailFullView);
}

if (detailExitViewBtn) {
  detailExitViewBtn.addEventListener('click', closeDetailFullView);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('poc-fullview')) {
    closeDetailFullView();
  }
});

window.addEventListener('beforeunload', () => {
  stopFpsGauge();
  if (memoryGaugeTimer) {
    clearInterval(memoryGaugeTimer);
    memoryGaugeTimer = null;
  }
});

if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

if (pocForm) {
  pocForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!apiAvailable || !currentItem) return;

    const formData = new FormData();
    formData.append('title', (pocTitle.value || '').trim());
    formData.append('description', (pocDescription.value || '').trim());
    formData.append('tags', (pocTags.value || '').trim());
    formData.append('brief', (pocBrief.value || '').trim());

    const hasZip = pocZip?.files && pocZip.files[0];
    const codeValue = (pocCode.value || '').trim();
    if (hasZip) {
      formData.append('code', '');
    } else if (codeValue && codeValue !== editOriginalCode) {
      formData.append('code', codeValue);
    }

    if (pocThumbnail?.files && pocThumbnail.files[0]) {
      formData.append('thumbnail', pocThumbnail.files[0]);
    }
    if (hasZip) {
      formData.append('pocZip', pocZip.files[0]);
    }
    if (pocBriefImages?.files && pocBriefImages.files.length) {
      Array.from(pocBriefImages.files).forEach((file) => formData.append('briefImages', file));
    }

    try {
      const res = await fetch(`/api/pocs/${encodeURIComponent(currentItem.id)}`, {
        method: 'PUT',
        body: formData
      });
      if (!res.ok) {
        let message = 'Failed to update POC.';
        try {
          const payload = await res.json();
          if (payload?.error) message = payload.error;
        } catch {
          // Keep fallback
        }
        throw new Error(message);
      }
      closeModal();
      showSuccessToast('POC updated successfully.');
      await loadDetail();
    } catch (err) {
      modalNote.textContent = err.message || 'Failed to update POC.';
    }
  });
}

initMobileSidebar();
initCollapsiblePanels();
loadDetail();
