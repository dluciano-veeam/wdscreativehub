const detailTitle = document.getElementById('detailTitle');
const detailDescription = document.getElementById('detailDescription');
const detailTags = document.getElementById('detailTags');
const detailFrame = document.getElementById('detailFrame');
const detailEditBtn = document.getElementById('detailEditBtn');
const exportZipBtn = document.getElementById('exportZipBtn');
const detailCrumbCurrent = document.getElementById('detailCrumbCurrent');
const refreshCodeBtn = document.getElementById('refreshCodeBtn');
const codeHtml = document.getElementById('codeHtml');
const codeCss = document.getElementById('codeCss');
const codeJs = document.getElementById('codeJs');
const copyButtons = Array.from(document.querySelectorAll('.code-copy-btn'));
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
  const doc = parser.parseFromString(sourceHtml || '', 'text/html');

  const cssParts = [];
  const jsParts = [];

  doc.querySelectorAll('style').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (text) cssParts.push(text);
  });

  const styleLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));
  for (const link of styleLinks) {
    const href = link.getAttribute('href') || '';
    const resolved = resolveAssetPath(entryPath, href);
    if (resolved && !resolved.startsWith('http')) {
      const cssText = await fetchTextSafe(resolved);
      if (cssText.trim()) cssParts.push(`/* ${href} */\n${cssText.trim()}`);
    }
  }

  const scripts = Array.from(doc.querySelectorAll('script'));
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

  const htmlOutput = sourceHtml && sourceHtml.trim() ? sourceHtml.trim() : 'Source unavailable.';
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

async function exportCurrentPocZip() {
  if (!currentItem) return;
  if (!window.JSZip) {
    alert('ZIP export dependency not loaded. Please refresh and try again.');
    return;
  }

  const item = currentItem;
  const zip = new window.JSZip();
  const rootFolder = sanitizeFileName(item.id || item.title);
  const base = zip.folder(rootFolder);
  if (!base) return;

  const htmlSource = item.entry ? await fetchTextSafe(item.entry) : (item.code || '');
  if (!htmlSource.trim()) {
    alert('No source available to export for this POC.');
    return;
  }

  if (item.entry) {
    const entryRel = toProjectRelativePath(item.entry);
    base.file(entryRel, htmlSource);
  } else {
    base.file('index.html', htmlSource);
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
    const rel = toProjectRelativePath(absolutePath);
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
    `Open: ${item.entry ? toProjectRelativePath(item.entry) : 'index.html'}`
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
detailFrame.addEventListener('load', injectTypographyIntoFrame);

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
  }

  if (item.entry) {
    detailFrame.removeAttribute('srcdoc');
    const sep = item.entry.includes('?') ? '&' : '?';
    detailFrame.src = withBasePath(`${item.entry}${sep}v=${Date.now()}`);
  } else {
    detailFrame.srcdoc = item.code || '';
  }

  await refreshSourcePanels();
  if (refreshCodeBtn) {
    refreshCodeBtn.onclick = refreshSourcePanels;
  }

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

loadDetail();
