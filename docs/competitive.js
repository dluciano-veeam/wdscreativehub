const competitorGrid = document.getElementById('competitorGrid');
const competitorSearch = document.getElementById('competitorSearch');
const competitiveCount = document.getElementById('competitiveCount');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar = document.querySelector('.sidebar');

const SITE_BASE_PATH = window.location.pathname.includes('/wdscreativehub/')
  ? '/wdscreativehub'
  : '';
const DATA_FALLBACK = 'data/competitors.json?v=1';

let competitors = [];
let search = '';

document.body.classList.add('page-ready');
if (competitorGrid) {
  competitorGrid.classList.add('competitive-grid');
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

function getDefaultThumb(name) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f1722"/><stop offset="100%" stop-color="#1d3b30"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><text x="50%" y="46%" fill="#9CFFA3" font-size="48" font-family="Arial, sans-serif" text-anchor="middle">${name}</text><text x="50%" y="56%" fill="#b7c7d8" font-size="24" font-family="Arial, sans-serif" text-anchor="middle">Competitive Analysis</text></svg>`
  );
}

function getLiveThumb(website) {
  if (!website) return '';
  const encoded = encodeURIComponent(website);
  return `https://image.thum.io/get/width/1400/noanimate/${encoded}`;
}

function normalizeItems(data) {
  return Array.isArray(data) ? data : (data.items || []);
}

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

async function fetchCompetitors() {
  try {
    const res = await fetch(withBasePath('/api/competitors'));
    if (!res.ok) throw new Error('api unavailable');
    const data = await res.json();
    competitors = normalizeItems(data);
  } catch {
    const res = await fetch(DATA_FALLBACK);
    const data = await res.json();
    competitors = normalizeItems(data);
  }
  render();
}

function render() {
  const filtered = competitors.filter((item) => {
    const haystack = `${item.name || ''} ${item.category || ''} ${(item.labels || []).join(' ')}`.toLowerCase();
    return !search || haystack.includes(search);
  });

  competitorGrid.innerHTML = '';
  competitiveCount.textContent = `${filtered.length} client${filtered.length === 1 ? '' : 's'} in view`;

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.style.color = '#4b5e73';
    empty.textContent = 'No competitors found with this filter.';
    competitorGrid.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'card competitor-card';
    if ((item.thumbnailFit || '').toLowerCase() === 'contain') {
      card.classList.add('media-contain');
    }

    const media = document.createElement('div');
    media.className = 'card-media';

    const img = document.createElement('img');
    img.alt = item.name || 'Competitor thumbnail';
    img.src = withBasePath(item.thumbnail) || getLiveThumb(item.website) || getDefaultThumb(item.name || 'Competitor');
    img.style.objectFit = (item.thumbnailFit || 'cover').toLowerCase();
    img.addEventListener('error', () => {
      img.src = getDefaultThumb(item.name || 'Competitor');
    });
    media.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.textContent = item.name || 'Unnamed competitor';

    const desc = document.createElement('p');
    desc.textContent = item.notes || item.category || 'No notes yet.';

    const meta = document.createElement('div');
    meta.className = 'competitive-meta';
    meta.innerHTML = `
      <span class="tag-chip">${item.status || 'monitoring'}</span>
      <span class="tag-chip">Since ${item.trackingSince || '-'}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'competitive-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'button';
    openBtn.type = 'button';
    openBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h8V3H3v10zm10 8h8v-8h-8v8zM3 21h8v-6H3v6zm10-18v8h8V3h-8z"/></svg>
      <span>Open dashboard</span>
    `;
    openBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      window.location.href = `./competitive-client.html?id=${encodeURIComponent(item.id)}`;
    });

    const siteLink = document.createElement('a');
    siteLink.className = 'button ghost';
    siteLink.href = item.website || '#';
    siteLink.target = '_blank';
    siteLink.rel = 'noreferrer noopener';
    siteLink.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"/></svg>
      <span>Visit site</span>
    `;

    actions.appendChild(openBtn);
    actions.appendChild(siteLink);

    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(meta);
    body.appendChild(actions);

    card.appendChild(media);
    card.appendChild(body);

    card.addEventListener('click', () => {
      window.location.href = `./competitive-client.html?id=${encodeURIComponent(item.id)}`;
    });

    competitorGrid.appendChild(card);
  });
}

competitorSearch.addEventListener('input', (event) => {
  search = (event.target.value || '').trim().toLowerCase();
  render();
});

initMobileSidebar();
fetchCompetitors();
