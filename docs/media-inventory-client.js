const inventoryClientTitle = document.getElementById('inventoryClientTitle');
const inventoryClientSubtitle = document.getElementById('inventoryClientSubtitle');
const inventoryCrumb = document.getElementById('inventoryCrumb');
const inventorySiteLink = document.getElementById('inventorySiteLink');
const runScanBtn = document.getElementById('runScanBtn');
const inventoryStatus = document.getElementById('inventoryStatus');
const mediaKpiRow = document.getElementById('mediaKpiRow');
const pageCardsGrid = document.getElementById('pageCardsGrid');
const pageFilterInput = document.getElementById('pageFilterInput');
const exportFilteredCsvBtn = document.getElementById('exportFilteredCsvBtn');
const exportAllCsvBtn = document.getElementById('exportAllCsvBtn');
const mediaModalOverlay = document.getElementById('mediaModalOverlay');
const closeMediaModalBtn = document.getElementById('closeMediaModalBtn');
const mediaModalTitle = document.getElementById('mediaModalTitle');
const mediaModalSubtitle = document.getElementById('mediaModalSubtitle');
const mediaModalOpenPageLink = document.getElementById('mediaModalOpenPageLink');
const mediaModalTypeFilterSelect = document.getElementById('mediaModalTypeFilterSelect');
const mediaModalStats = document.getElementById('mediaModalStats');
const mediaModalAssets = document.getElementById('mediaModalAssets');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar = document.querySelector('.sidebar');

const CLIENTS_FALLBACK = 'data/media-inventory-clients.json?v=1';
const params = new URLSearchParams(window.location.search);
const clientId = params.get('id') || 'veeam';
const SITE_BASE_PATH = window.location.pathname.includes('/wdscreativehub/')
  ? '/wdscreativehub'
  : '';

const typeOrder = ['png', 'jpg', 'jpeg', 'svg', 'webm', 'video', 'lottie', 'webp', 'gif', 'avif', 'json', 'audio', 'other'];
let currentClient = null;
let currentReport = null;
let pageFilter = '';
let apiAvailable = true;
let hoverPreview = null;
let activePage = null;
let modalTypeFilter = 'all';

function withBasePath(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) {
    return path;
  }
  if (path.startsWith('/')) {
    return `${SITE_BASE_PATH}${path}`;
  }
  return path;
}

function normalizeItems(data) {
  return Array.isArray(data) ? data : (data.items || []);
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

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setStatus(message, type = 'info') {
  if (!inventoryStatus) return;
  const shouldShow = Boolean(message) && type === 'error';
  inventoryStatus.textContent = shouldShow ? message : '';
  inventoryStatus.classList.toggle('hidden', !shouldShow);
  inventoryStatus.classList.toggle('status-error', shouldShow);
}

function setSubtitle(message, status = 'neutral') {
  if (!inventoryClientSubtitle) return;
  const normalized = String(message || '').trim();
  const withPrefix = status === 'ok'
    ? `✓ ${normalized}`
    : normalized;
  inventoryClientSubtitle.textContent = withPrefix;
  inventoryClientSubtitle.classList.toggle('scan-status-ok', status === 'ok');
  inventoryClientSubtitle.classList.toggle('scan-status-neutral', status !== 'ok');
}

function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      clientId: clientId || '',
      persistedAt: '',
      scannedAt: '',
      rootUrl: currentClient?.website || '',
      totals: { pages: 0, media: 0, hiddenMedia: 0, byType: {} },
      pages: []
    };
  }
  return {
    clientId: raw.clientId || clientId || '',
    persistedAt: raw.persistedAt || '',
    scannedAt: raw.scannedAt || '',
    rootUrl: raw.rootUrl || currentClient?.website || '',
    totals: {
      pages: Number(raw.totals?.pages || 0),
      media: Number(raw.totals?.media || 0),
      hiddenMedia: Number(raw.totals?.hiddenMedia || 0),
      byType: raw.totals?.byType || {}
    },
    pages: Array.isArray(raw.pages) ? raw.pages : []
  };
}

async function fetchClient() {
  try {
    const res = await fetch(withBasePath('/api/media-inventory/clients'));
    if (!res.ok) throw new Error('api unavailable');
    const clients = normalizeItems(await res.json());
    apiAvailable = true;
    return clients.find((item) => item.id === clientId) || null;
  } catch {
    const res = await fetch(CLIENTS_FALLBACK);
    const clients = normalizeItems(await res.json());
    apiAvailable = false;
    return clients.find((item) => item.id === clientId) || null;
  }
}

async function fetchStaticReport() {
  const candidates = [
    withBasePath('/data/media-inventory-reports.json?v=3'),
    './data/media-inventory-reports.json?v=3',
    'data/media-inventory-reports.json?v=3'
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const payload = await res.json();
      const items = payload?.items && typeof payload.items === 'object' ? payload.items : {};
      const direct = items[clientId];
      if (direct) return normalizeReport(direct);

      const firstKey = Object.keys(items)[0];
      if (firstKey && items[firstKey]) {
        return normalizeReport(items[firstKey]);
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function fetchLastReport() {
  if (!clientId) return null;
  if (!apiAvailable) {
    return fetchStaticReport();
  }
  try {
    const res = await fetch(withBasePath(`/api/media-inventory/reports/${encodeURIComponent(clientId)}`));
    if (res.status === 404) {
      return fetchStaticReport();
    }
    if (!res.ok) throw new Error(`Failed to load last report (${res.status})`);
    return normalizeReport(await res.json());
  } catch {
    return fetchStaticReport();
  }
}

async function runScan() {
  if (!currentClient?.website) return;
  if (!apiAvailable) {
    setSubtitle('Run scan disabled in static mode', 'neutral');
    return;
  }
  const previousLabel = runScanBtn.querySelector('span')?.textContent || 'Run scan';
  const labelNode = runScanBtn.querySelector('span');
  runScanBtn.setAttribute('aria-disabled', 'true');
  runScanBtn.disabled = true;
  runScanBtn.classList.add('is-loading');
  if (labelNode) labelNode.textContent = 'Scanning';
  setSubtitle('Scanning pages and collecting media assets...', 'neutral');
  try {
    const res = await fetch(withBasePath('/api/media-inventory/scan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        rootUrl: currentClient.website,
        maxPages: 120
      })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || `Scan failed (${res.status})`);
    }
    const report = normalizeReport(await res.json());
    currentReport = report;
    renderReport();
    setSubtitle(
      `Last saved scan: ${formatDate(report.persistedAt || report.scannedAt)} • ${report.totals.pages} pages • ${report.totals.media} assets`,
      'ok'
    );
    setStatus('', 'info');
  } catch (err) {
    setSubtitle('Scan failed. Please retry.', 'neutral');
    setStatus(
      `${err.message}. Start with \`npm run dev\` to enable live crawl and make sure the server has internet access.`,
      'error'
    );
  } finally {
    if (labelNode) labelNode.textContent = previousLabel;
    runScanBtn.classList.remove('is-loading');
    runScanBtn.removeAttribute('aria-disabled');
    runScanBtn.disabled = false;
  }
}

function mediaThumb(url, type) {
  if (!url) return '';
  if (type === 'video' || type === 'webm') {
    const label = type === 'webm' ? 'WEBM' : 'Video';
    return `<div class="media-asset-thumb media-asset-thumb--video"><span>${label}</span></div>`;
  }
  return `<img src="${url}" alt="${type} asset thumbnail" loading="lazy" />`;
}

function mediaAssetPill(asset) {
  const hiddenClass = asset.visibility === 'hidden' ? 'is-hidden' : '';
  const title = asset.hiddenReasons?.length
    ? `${asset.type.toUpperCase()} • hidden (${asset.hiddenReasons.join(', ')})`
    : asset.type.toUpperCase();
  const thumb = mediaThumb(asset.thumbnailUrl || asset.url, asset.type);
  return `
    <a class="media-asset-pill ${hiddenClass}" href="${asset.url}" target="_blank" rel="noreferrer noopener" title="${title}" data-preview-url="${asset.type === 'video' ? '' : (asset.thumbnailUrl || asset.url || '')}" data-preview-label="${asset.type.toUpperCase()}">
      <span class="media-asset-preview">${thumb}</span>
      <span class="media-asset-meta">
        <strong>${asset.type}</strong>
        <small>${asset.visibility}</small>
      </span>
    </a>
  `;
}

function pageScreenshotSources(url) {
  if (!url) {
    return { primary: '', fallback: '' };
  }
  return {
    primary: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1600`,
    fallback: ''
  };
}

function getTypeCount(byType, key) {
  return Number(byType?.[key] || 0);
}

function countByType(items = []) {
  const counters = {};
  items.forEach((item) => {
    const key = item.type || 'other';
    counters[key] = (counters[key] || 0) + 1;
  });
  return counters;
}

function renderKpis(report) {
  const byType = report.totals.byType || {};
  const baseCards = [
    { label: 'Pages scanned', value: report.totals.pages },
    { label: 'Total media', value: report.totals.media },
    { label: 'Hidden media', value: report.totals.hiddenMedia }
  ];
  const typeCards = Object.keys(byType)
    .filter((type) => Number(byType[type]) > 0)
    .sort((a, b) => a.localeCompare(b))
    .map((type) => ({
      label: type.toUpperCase(),
      value: getTypeCount(byType, type)
    }));
  const cards = [...baseCards, ...typeCards];

  mediaKpiRow.innerHTML = '';
  cards.forEach((card) => {
    const el = document.createElement('article');
    el.className = 'competitive-kpi';
    el.innerHTML = `<div class="competitive-kpi-label">${card.label}</div><div class="competitive-kpi-value">${card.value}</div>`;
    mediaKpiRow.appendChild(el);
  });
}

function getFilteredPages(report) {
  return report.pages
    .map((page) => {
      const media = Array.isArray(page.media) ? page.media : [];
      return {
        ...page,
        mediaFiltered: media
      };
    })
    .filter((page) => {
    if (!pageFilter) return true;
    const haystack = `${page.path || ''} ${page.title || ''} ${page.url || ''}`.toLowerCase();
    return haystack.includes(pageFilter);
    })
    .filter((page) => page.mediaFiltered.length > 0)
    .sort((a, b) => {
      const pathA = String(a.path || '');
      const pathB = String(b.path || '');
      const isHomeA = pathA === '/' || pathA === '';
      const isHomeB = pathB === '/' || pathB === '';
      if (isHomeA !== isHomeB) return isHomeA ? -1 : 1;
      const depthA = pathA.split('/').filter(Boolean).length;
      const depthB = pathB.split('/').filter(Boolean).length;
      if (depthA !== depthB) return depthA - depthB;
      return pathA.localeCompare(pathB);
    });
}

function renderPageCards(report) {
  const pages = getFilteredPages(report);

  pageCardsGrid.innerHTML = '';
  if (!pages.length) {
    const empty = document.createElement('div');
    empty.className = 'media-table-empty';
    empty.textContent = 'No pages match this filter.';
    pageCardsGrid.appendChild(empty);
    return;
  }

  pages.forEach((page) => {
    const media = Array.isArray(page.mediaFiltered) ? page.mediaFiltered : [];
    const counts = countByType(media);
    const hidden = media.filter((item) => item.visibility === 'hidden').length;
    const shots = pageScreenshotSources(page.url);
    const card = document.createElement('article');
    card.className = 'media-page-card';
    card.innerHTML = `
      <div class="media-page-shot">
        <img src="${shots.primary}" data-fallback-src="${shots.fallback}" alt="Screenshot of ${page.path || page.url || 'page'}" loading="lazy">
      </div>
      <div class="media-page-content">
        <div class="media-page-main">
          <strong>${page.path || page.url || '/'}</strong>
          <small>${page.title || page.url || ''}</small>
        </div>
        <div class="media-page-meta-grid">
          <span><b>Total</b>${media.length}</span>
          <span><b>Hidden</b>${hidden}</span>
          <span><b>PNG</b>${getTypeCount(counts, 'png')}</span>
          <span><b>JPG</b>${getTypeCount(counts, 'jpg')}</span>
          <span><b>JPEG</b>${getTypeCount(counts, 'jpeg')}</span>
          <span><b>WEBP</b>${getTypeCount(counts, 'webp')}</span>
          <span><b>SVG</b>${getTypeCount(counts, 'svg')}</span>
          <span><b>WEBM</b>${getTypeCount(counts, 'webm')}</span>
          <span><b>Video</b>${getTypeCount(counts, 'video')}</span>
          <span><b>Lottie</b>${getTypeCount(counts, 'lottie')}</span>
        </div>
      </div>
    `;
    const shotImg = card.querySelector('.media-page-shot img');
    if (shotImg) {
      shotImg.addEventListener('error', () => {
        const fallback = shotImg.dataset.fallbackSrc || '';
        if (fallback && shotImg.src !== fallback) {
          shotImg.src = fallback;
          return;
        }
        shotImg.classList.add('is-missing');
      }, { once: false });
    }
    card.addEventListener('click', () => {
      activePage = page;
      openPageModal(page);
    });
    pageCardsGrid.appendChild(card);
  });
}

function openPageModal(page) {
  const allMedia = Array.isArray(page.mediaFiltered) ? page.mediaFiltered : [];
  const available = Object.keys(countByType(allMedia)).sort((a, b) => a.localeCompare(b));
  mediaModalTypeFilterSelect.innerHTML = '<option value="all">All types</option>';
  available.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.toUpperCase();
    mediaModalTypeFilterSelect.appendChild(option);
  });
  if (modalTypeFilter !== 'all' && !available.includes(modalTypeFilter)) {
    modalTypeFilter = 'all';
  }
  mediaModalTypeFilterSelect.value = modalTypeFilter;

  const media = modalTypeFilter === 'all'
    ? allMedia
    : allMedia.filter((item) => (item.type || 'other') === modalTypeFilter);
  const counts = countByType(media);
  mediaModalTitle.textContent = page.path || page.url || '/';
  mediaModalSubtitle.textContent = page.title || page.url || '';
  if (mediaModalOpenPageLink) {
    mediaModalOpenPageLink.href = page.url || '#';
    mediaModalOpenPageLink.setAttribute('aria-disabled', page.url ? 'false' : 'true');
  }
  mediaModalStats.innerHTML = `
    <span class="tag-chip">Total ${media.length}</span>
    <span class="tag-chip">Hidden ${media.filter((item) => item.visibility === 'hidden').length}</span>
    <span class="tag-chip">PNG ${getTypeCount(counts, 'png')}</span>
    <span class="tag-chip">JPG ${getTypeCount(counts, 'jpg')}</span>
    <span class="tag-chip">JPEG ${getTypeCount(counts, 'jpeg')}</span>
    <span class="tag-chip">WEBP ${getTypeCount(counts, 'webp')}</span>
    <span class="tag-chip">SVG ${getTypeCount(counts, 'svg')}</span>
    <span class="tag-chip">WEBM ${getTypeCount(counts, 'webm')}</span>
    <span class="tag-chip">Video ${getTypeCount(counts, 'video')}</span>
    <span class="tag-chip">Lottie ${getTypeCount(counts, 'lottie')}</span>
  `;
  mediaModalAssets.innerHTML = `
    <div class="media-assets-cell">
      ${media.map(mediaAssetPill).join('')}
    </div>
  `;
  mediaModalOverlay.classList.remove('hidden');
}

function closePageModal() {
  activePage = null;
  modalTypeFilter = 'all';
  mediaModalOverlay.classList.add('hidden');
}

function initModalEvents() {
  closeMediaModalBtn.addEventListener('click', closePageModal);
  mediaModalOverlay.addEventListener('click', (event) => {
    if (event.target === mediaModalOverlay) {
      closePageModal();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !mediaModalOverlay.classList.contains('hidden')) {
      closePageModal();
    }
  });
}

function renderRows(report) {
  renderPageCards(report);
  if (activePage) {
    const pages = getFilteredPages(report);
    const match = pages.find((item) => item.url === activePage.url);
    if (match) {
      openPageModal(match);
    } else {
      closePageModal();
    }
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function buildCsvRows({ filteredOnly }) {
  const report = normalizeReport(currentReport);
  const pages = filteredOnly ? getFilteredPages(report) : report.pages.map((page) => ({
    ...page,
    mediaFiltered: Array.isArray(page.media) ? page.media : []
  }));

  const header = [
    'client_id',
    'root_url',
    'page_url',
    'page_path',
    'page_title',
    'asset_type',
    'asset_extension',
    'asset_url',
    'element',
    'visibility',
    'hidden_reasons',
    'source'
  ];

  const rows = [header];
  pages.forEach((page) => {
    (page.mediaFiltered || []).forEach((asset) => {
      rows.push([
        report.clientId || clientId || '',
        report.rootUrl || '',
        page.url || '',
        page.path || '',
        page.title || '',
        asset.type || '',
        asset.extension || '',
        asset.url || '',
        asset.element || '',
        asset.visibility || '',
        (asset.hiddenReasons || []).join('|'),
        asset.via || ''
      ]);
    });
  });

  return rows;
}

function createHoverPreview() {
  if (hoverPreview) return hoverPreview;
  const node = document.createElement('div');
  node.className = 'media-hover-preview hidden';
  node.innerHTML = '<img alt="Asset preview"><span></span>';
  document.body.appendChild(node);
  hoverPreview = node;
  return hoverPreview;
}

function initAssetHoverPreview() {
  const preview = createHoverPreview();
  const image = preview.querySelector('img');
  const label = preview.querySelector('span');

  document.addEventListener('mouseover', (event) => {
    const target = event.target.closest('.media-asset-pill');
    if (!target) return;
    const url = target.dataset.previewUrl || '';
    if (!url) return;
    image.src = url;
    label.textContent = target.dataset.previewLabel || '';
    preview.classList.remove('hidden');
  });

  document.addEventListener('mouseout', (event) => {
    if (event.target.closest('.media-asset-pill')) {
      preview.classList.add('hidden');
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (preview.classList.contains('hidden')) return;
    const offset = 16;
    const maxX = window.innerWidth - preview.offsetWidth - 8;
    const maxY = window.innerHeight - preview.offsetHeight - 8;
    const x = Math.min(maxX, event.clientX + offset);
    const y = Math.min(maxY, event.clientY + offset);
    preview.style.left = `${Math.max(8, x)}px`;
    preview.style.top = `${Math.max(8, y)}px`;
  });
}

function renderReport() {
  const report = normalizeReport(currentReport);
  renderKpis(report);
  renderRows(report);
}

async function init() {
  currentClient = await fetchClient();
  if (!currentClient) {
    inventoryClientTitle.textContent = 'Client not found';
    inventoryClientSubtitle.textContent = 'This media inventory client is not configured.';
    runScanBtn.disabled = true;
    return;
  }

  inventoryClientTitle.textContent = `${currentClient.name} Media Inventory`;
  setSubtitle('Loading latest persisted snapshot...', 'neutral');
  inventoryCrumb.textContent = currentClient.name || 'Client';
  inventorySiteLink.href = currentClient.website || '#';

  if (!apiAvailable) {
    runScanBtn.disabled = true;
    runScanBtn.setAttribute('aria-disabled', 'true');
    runScanBtn.title = 'Disabled in static online mode';
  }

  const savedReport = await fetchLastReport();
  if (savedReport) {
    currentReport = savedReport;
    renderReport();
    setSubtitle(
      `Last saved scan: ${formatDate(savedReport.persistedAt || savedReport.scannedAt)} • ${savedReport.totals.pages} pages • ${savedReport.totals.media} assets`,
      'ok'
    );
    setStatus('', 'info');
  } else {
    currentReport = normalizeReport(null);
    renderReport();
    setSubtitle(
      apiAvailable
        ? 'No saved scan yet'
        : 'Static mode: no persisted snapshot found yet',
      'neutral'
    );
    setStatus(
      apiAvailable
        ? 'No saved scan yet. Click "Run scan" to map all internal pages and media files.'
        : 'No persisted report found for online mode yet.'
    );
  }
}

pageFilterInput.addEventListener('input', (event) => {
  pageFilter = (event.target.value || '').trim().toLowerCase();
  renderRows(normalizeReport(currentReport));
});

mediaModalTypeFilterSelect.addEventListener('change', (event) => {
  modalTypeFilter = event.target.value || 'all';
  if (activePage) {
    openPageModal(activePage);
  }
});

runScanBtn.addEventListener('click', runScan);
exportFilteredCsvBtn.addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadCsv(`media-inventory-${clientId}-filtered-${stamp}.csv`, buildCsvRows({ filteredOnly: true }));
});
exportAllCsvBtn.addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadCsv(`media-inventory-${clientId}-all-${stamp}.csv`, buildCsvRows({ filteredOnly: false }));
});

initMobileSidebar();
initAssetHoverPreview();
initModalEvents();
init();
