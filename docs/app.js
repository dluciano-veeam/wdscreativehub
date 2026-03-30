const galleryGrid = document.getElementById('galleryGrid');
const tagFilters = document.getElementById('tagFilters');
const searchInput = document.getElementById('searchInput');
const addPocBtn = document.getElementById('addPocBtn');
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalTitle = document.querySelector('.modal-header h2');
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
let items = [];
let selectedTags = new Set();
let apiAvailable = true;
let editId = null;
let editOriginalCode = '';
let toastTimer = null;
const params = new URLSearchParams(window.location.search);
const autoEditId = params.get('edit');

const state = {
  search: ''
};

const DATA_FALLBACK = 'data/pocs.json?v=2';
const BASE_STAGGER = 0.18;
const MEDIA_HEIGHTS = [176, 208, 236, 268, 296];
let masonryRaf = null;
const SITE_BASE_PATH = (() => {
  const isGitHubPages = window.location.hostname.endsWith('github.io');
  if (!isGitHubPages) return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length ? `/${parts[0]}` : '';
})();

function withBasePath(value) {
  if (!value) return value;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (value.startsWith('/')) return `${SITE_BASE_PATH}${value}`;
  return value;
}

function getMasonryConfig() {
  if (window.matchMedia('(max-width: 960px)').matches) {
    return { minWidth: 220, gap: 14 };
  }
  return { minWidth: 280, gap: 20 };
}

function queueMasonryLayout() {
  if (masonryRaf) {
    cancelAnimationFrame(masonryRaf);
  }
  masonryRaf = requestAnimationFrame(() => {
    masonryRaf = null;
    applyMasonryLayout();
  });
}

function applyMasonryLayout() {
  const cards = Array.from(galleryGrid.querySelectorAll('.card'));
  if (!cards.length) {
    galleryGrid.style.height = '0px';
    return;
  }

  const { minWidth, gap } = getMasonryConfig();
  const containerWidth = galleryGrid.clientWidth;
  if (!containerWidth) return;

  const columns = Math.max(1, Math.floor((containerWidth + gap) / (minWidth + gap)));
  const cardWidth = (containerWidth - (columns - 1) * gap) / columns;
  const columnHeights = new Array(columns).fill(0);

  cards.forEach((card) => {
    let targetColumn = 0;
    for (let i = 1; i < columns; i += 1) {
      if (columnHeights[i] < columnHeights[targetColumn]) {
        targetColumn = i;
      }
    }

    const x = targetColumn * (cardWidth + gap);
    const y = columnHeights[targetColumn];

    card.style.width = `${cardWidth}px`;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;

    columnHeights[targetColumn] = y + card.offsetHeight + gap;
  });

  galleryGrid.style.height = `${Math.max(...columnHeights) - gap}px`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function fetchItems() {
  try {
    const res = await fetch('/api/pocs');
    if (!res.ok) {
      throw new Error('API not available');
    }
    const data = await res.json();
    items = Array.isArray(data) ? data : (data.items || []);
    apiAvailable = true;
  } catch (err) {
    const res = await fetch(DATA_FALLBACK);
    const data = await res.json();
    items = Array.isArray(data) ? data : (data.items || []);
    apiAvailable = false;
  }
  render();
}

function parseTags(value) {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function openEditModal(item) {
  editId = item.id;
  editOriginalCode = (item.code || '').trim();
  modalTitle.textContent = 'Edit POC';
  pocTitle.value = item.title || '';
  pocDescription.value = item.description || '';
  pocTags.value = Array.isArray(item.tags) ? item.tags.join(', ') : '';
  pocBrief.value = item.brief || '';
  pocCode.value = item.code || '';
  modalNote.textContent = 'Update fields or upload a ZIP and save.';
  openModal();
}

function renderTags() {
  const tagList = items.reduce((acc, item) => {
    if (item.aiPending) return acc;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    tags.forEach((tag) => acc.push(tag));
    return acc;
  }, []);
  const allTags = Array.from(new Set(tagList)).sort((a, b) => a.localeCompare(b));

  tagFilters.innerHTML = '';
  allTags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.className = `tag ${selectedTags.has(tag) ? 'active' : ''}`;
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        selectedTags.add(tag);
      }
      render();
    });
    tagFilters.appendChild(btn);
  });
}

function renderGallery() {
  galleryGrid.innerHTML = '';

  const filtered = items.filter((item) => {
    if (item.aiPending) return false;
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const searchMatch =
      !state.search ||
      title.includes(state.search) ||
      description.includes(state.search);

    const tagsMatch =
      selectedTags.size === 0 ||
      (Array.isArray(item.tags) && item.tags.some((tag) => selectedTags.has(tag)));

    return searchMatch && tagsMatch;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#9fb3c8';
    empty.textContent = 'No POCs yet.';
    galleryGrid.appendChild(empty);
    return;
  }

  filtered.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.animationDelay = `${BASE_STAGGER + index * 0.05}s`;
    const mediaHeight = MEDIA_HEIGHTS[hashString(item.id || item.title || String(index)) % MEDIA_HEIGHTS.length];
    card.style.setProperty('--media-h', `${mediaHeight}px`);

    const media = document.createElement('div');
    media.className = 'card-media';

    const img = document.createElement('img');
    img.alt = item.title;
    img.src = withBasePath(item.thumbnail) || 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320"><rect width="100%" height="100%" fill="#e8eef0"/><text x="50%" y="50%" fill="#505861" font-size="22" font-family="Arial" text-anchor="middle" dy=".3em">No thumbnail</text></svg>`);
    media.appendChild(img);
    img.addEventListener('load', queueMasonryLayout);
    img.addEventListener('error', queueMasonryLayout);

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.textContent = item.title || 'Untitled POC';

    const desc = document.createElement('p');
    desc.textContent = item.description || 'No description';

    const tags = document.createElement('div');
    tags.className = 'tag-row';
    item.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(tags);

    card.appendChild(media);
    card.appendChild(body);

    card.addEventListener('click', () => {
      window.location.href = `poc.html?id=${item.id}`;
    });

    // No hover preview in gallery: keep thumbnail only.

    galleryGrid.appendChild(card);
  });

  queueMasonryLayout();
}

function render() {
  renderTags();
  renderGallery();
  if (!apiAvailable) {
    addPocBtn.disabled = true;
    addPocBtn.title = 'Add POC is available in local mode';
  } else {
    addPocBtn.disabled = false;
    addPocBtn.title = '';
  }
}

searchInput.addEventListener('input', (event) => {
  state.search = event.target.value.toLowerCase();
  renderGallery();
});

window.addEventListener('resize', queueMasonryLayout);

function openModal() {
  modalOverlay.classList.remove('hidden');
  modalNote.textContent = '';
  if (pocZip) {
    pocZip.value = '';
  }
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  pocForm.reset();
  modalNote.textContent = '';
  editId = null;
  editOriginalCode = '';
  modalTitle.textContent = 'Add POC';
}

function showSuccessToast(message) {
  if (!globalToast) return;
  globalToast.textContent = message;
  globalToast.classList.remove('hidden');
  // Force reflow for transition restart.
  void globalToast.offsetWidth;
  globalToast.classList.add('visible');
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    globalToast.classList.remove('visible');
    setTimeout(() => globalToast.classList.add('hidden'), 220);
  }, 2400);
}


function buildPlaceholderCode(title) {
  return `<!doctype html>\\n<html lang=\\\"en\\\">\\n<head>\\n  <meta charset=\\\"utf-8\\\" />\\n  <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1\\\" />\\n  <title>${title}</title>\\n  <style>\\n    body { margin: 0; font-family: \\\"ES Build\\\", \\\"Segoe UI\\\", sans-serif; display: grid; place-items: center; min-height: 100vh; background: #f7f9fa; }\\n    .card { padding: 24px 28px; border-radius: 16px; background: #ffffff; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 12px 28px rgba(0,0,0,0.1); }\\n  </style>\\n</head>\\n<body>\\n  <div class=\\\"card\\\">${title}</div>\\n</body>\\n</html>`;
}

addPocBtn.addEventListener('click', () => {
  if (!apiAvailable) {
    modalNote.textContent = 'Add POC is available only in local mode.';
    openModal();
    return;
  }
  editId = null;
  modalTitle.textContent = 'Add POC';
  openModal();
});

closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

pocForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!apiAvailable) return;

  const formData = new FormData();
  formData.append('title', pocTitle.value.trim());
  formData.append('description', pocDescription.value.trim());
  formData.append('tags', (pocTags.value || '').trim());
  formData.append('brief', pocBrief.value.trim());
  const hasZip = pocZip?.files && pocZip.files[0];
  const codeValue = (pocCode.value || '').trim();
  if (!editId) {
    formData.append('code', hasZip ? '' : (codeValue || buildPlaceholderCode(pocTitle.value.trim())));
  } else if (hasZip) {
    formData.append('code', '');
  } else if (codeValue && codeValue !== editOriginalCode) {
    formData.append('code', codeValue);
  }

  if (pocThumbnail.files && pocThumbnail.files[0]) {
    formData.append('thumbnail', pocThumbnail.files[0]);
  }
  if (hasZip) {
    formData.append('pocZip', pocZip.files[0]);
  }
  if (pocBriefImages.files && pocBriefImages.files.length) {
    Array.from(pocBriefImages.files).forEach((file) => {
      formData.append('briefImages', file);
    });
  }

  try {
    const url = editId ? `/api/pocs/${editId}` : '/api/pocs';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      body: formData
    });
    if (!res.ok) {
      let message = 'Failed to save POC.';
      try {
        const payload = await res.json();
        if (payload?.error) message = payload.error;
      } catch {
        // Keep fallback message when response is not JSON.
      }
      throw new Error(message);
    }
    await fetchItems();
    if (!editId) {
      closeModal();
      showSuccessToast('POC submitted successfully.');
    } else {
      closeModal();
      showSuccessToast('POC updated successfully.');
    }
  } catch (err) {
    modalNote.textContent = err.message || 'Failed to save POC. Check server logs.';
  }
});

document.body.classList.add('page-ready');
fetchItems().then(() => {
  if (apiAvailable && autoEditId) {
    const item = items.find((poc) => poc.id === autoEditId);
    if (item) {
      openEditModal(item);
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }
});
