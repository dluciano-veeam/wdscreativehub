const inventoryClientTitle = document.getElementById('inventoryClientTitle');
const inventoryClientSubtitle = document.getElementById('inventoryClientSubtitle');
const inventoryCrumb = document.getElementById('inventoryCrumb');
const inventorySiteLink = document.getElementById('inventorySiteLink');
const runScanBtn = document.getElementById('runScanBtn');
const inventoryStatus = document.getElementById('inventoryStatus');
const mediaKpiRow = document.getElementById('mediaKpiRow');
const mediaTableBody = document.getElementById('mediaTableBody');
const pageFilterInput = document.getElementById('pageFilterInput');
const typeFilterSelect = document.getElementById('typeFilterSelect');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar = document.querySelector('.sidebar');

const CLIENTS_FALLBACK = 'data/media-inventory-clients.json?v=1';
const params = new URLSearchParams(window.location.search);
const clientId = params.get('id') || 'veeam';
const SITE_BASE_PATH = window.location.pathname.includes('/wdscreativehub/')
  ? '/wdscreativehub'
  : '';

const typeOrder = ['png', 'jpg', 'jpeg', 'svg', 'video', 'lottie', 'webp', 'gif', 'avif', 'json', 'audio', 'other'];
let currentClient = null;
let currentReport = null;
let pageFilter = '';
let typeFilter = 'all';
let apiAvailable = true;

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
  inventoryStatus.textContent = message || '';
  inventoryStatus.classList.toggle('hidden', !message);
  inventoryStatus.classList.toggle('status-error', type === 'error');
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
  try {
    const res = await fetch('data/media-inventory-reports.json?v=2');
    if (!res.ok) throw new Error('no static report');
    const payload = await res.json();
    const report = payload?.items?.[clientId];
    return report ? normalizeReport(report) : null;
  } catch {
    return null;
  }
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
    setStatus('Run scan is disabled in online static mode. This page shows the latest persisted report.');
    return;
  }
  const previousLabel = runScanBtn.querySelector('span')?.textContent || 'Run scan';
  const labelNode = runScanBtn.querySelector('span');
  runScanBtn.setAttribute('aria-disabled', 'true');
  runScanBtn.disabled = true;
  runScanBtn.classList.add('is-loading');
  if (labelNode) labelNode.textContent = 'Scanning';
  setStatus('Scanning pages and collecting media inventory. This can take a few moments...');
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
    setStatus(
      `Scan completed on ${formatDate(report.scannedAt)}. ${report.totals.pages} pages and ${report.totals.media} media files inventoried.`
    );
  } catch (err) {
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
  if (type === 'video') {
    return `<div class="media-asset-thumb media-asset-thumb--video"><span>Video</span></div>`;
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
    <a class="media-asset-pill ${hiddenClass}" href="${asset.url}" target="_blank" rel="noreferrer noopener" title="${title}">
      <span class="media-asset-preview">${thumb}</span>
      <span class="media-asset-meta">
        <strong>${asset.type}</strong>
        <small>${asset.visibility}</small>
      </span>
    </a>
  `;
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

function renderTypeOptions(report) {
  const byType = report?.totals?.byType || {};
  const available = Object.keys(byType).filter((key) => Number(byType[key]) > 0);
  const sorted = available.sort((a, b) => a.localeCompare(b));

  typeFilterSelect.innerHTML = '<option value="all">All types</option>';
  sorted.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.toUpperCase();
    typeFilterSelect.appendChild(option);
  });

  if (!sorted.includes(typeFilter)) {
    typeFilter = 'all';
  }
  typeFilterSelect.value = typeFilter;
}

function renderKpis(report) {
  const byType = report.totals.byType || {};
  const cards = [
    { label: 'Pages scanned', value: report.totals.pages },
    { label: 'Total media', value: report.totals.media },
    { label: 'Hidden media', value: report.totals.hiddenMedia },
    { label: 'PNG', value: getTypeCount(byType, 'png') },
    { label: 'JPG', value: getTypeCount(byType, 'jpg') },
    { label: 'JPEG', value: getTypeCount(byType, 'jpeg') },
    { label: 'SVG', value: getTypeCount(byType, 'svg') },
    { label: 'Videos', value: getTypeCount(byType, 'video') }
  ];

  mediaKpiRow.innerHTML = '';
  cards.forEach((card) => {
    const el = document.createElement('article');
    el.className = 'competitive-kpi';
    el.innerHTML = `<div class="competitive-kpi-label">${card.label}</div><div class="competitive-kpi-value">${card.value}</div>`;
    mediaKpiRow.appendChild(el);
  });
}

function renderRows(report) {
  const pages = report.pages
    .map((page) => {
      const media = Array.isArray(page.media) ? page.media : [];
      const filteredMedia = typeFilter === 'all'
        ? media
        : media.filter((item) => (item.type || 'other') === typeFilter);
      return {
        ...page,
        mediaFiltered: filteredMedia
      };
    })
    .filter((page) => {
    if (!pageFilter) return true;
    const haystack = `${page.path || ''} ${page.title || ''} ${page.url || ''}`.toLowerCase();
    return haystack.includes(pageFilter);
    })
    .filter((page) => page.mediaFiltered.length > 0);

  mediaTableBody.innerHTML = '';
  if (!pages.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="9" class="media-table-empty">No pages match this filter.</td>';
    mediaTableBody.appendChild(row);
    return;
  }

  pages.forEach((page) => {
    const media = Array.isArray(page.mediaFiltered) ? page.mediaFiltered : [];
    const counts = countByType(media);
    const assets = media
      .slice()
      .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type))
      .slice(0, 28);
    const hidden = media.filter((item) => item.visibility === 'hidden').length;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <a class="media-page-link" href="${page.url || '#'}" target="_blank" rel="noreferrer noopener">
          <div class="media-page-main">
            <strong>${page.path || page.url || '/'}</strong>
            <small>${page.title || page.url || ''}</small>
          </div>
        </a>
      </td>
      <td>${media.length}</td>
      <td>${hidden}</td>
      <td>${getTypeCount(counts, 'png')}</td>
      <td>${getTypeCount(counts, 'jpg')}</td>
      <td>${getTypeCount(counts, 'jpeg')}</td>
      <td>${getTypeCount(counts, 'svg')}</td>
      <td>${getTypeCount(counts, 'video')}</td>
      <td><div class="media-assets-cell">${assets.map(mediaAssetPill).join('')}</div></td>
    `;
    mediaTableBody.appendChild(row);
  });
}

function renderReport() {
  const report = normalizeReport(currentReport);
  renderKpis(report);
  renderTypeOptions(report);
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
  inventoryClientSubtitle.textContent = `${currentClient.category || 'Category not set'} • ${currentClient.region || 'Region not set'}`;
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
    setStatus(
      `Loaded last saved scan from ${formatDate(savedReport.persistedAt || savedReport.scannedAt)}. ${savedReport.totals.pages} pages and ${savedReport.totals.media} media files inventoried.`
    );
  } else {
    currentReport = normalizeReport(null);
    renderReport();
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

typeFilterSelect.addEventListener('change', (event) => {
  typeFilter = event.target.value || 'all';
  renderRows(normalizeReport(currentReport));
});

runScanBtn.addEventListener('click', runScan);

initMobileSidebar();
init();
