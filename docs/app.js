const galleryGrid = document.getElementById('galleryGrid');
const tagFilters = document.getElementById('tagFilters');
const searchInput = document.getElementById('searchInput');
let items = [];
let selectedTags = new Set();

const state = {
  search: ''
};

const DATA_FALLBACK = 'data/pocs.json';

async function fetchItems() {
  try {
    const res = await fetch('/api/pocs');
    if (!res.ok) {
      throw new Error('API not available');
    }
    items = await res.json();
  } catch (err) {
    const res = await fetch(DATA_FALLBACK);
    items = await res.json();
  }
  render();
}

function parseTags(value) {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function renderTags() {
  const tagList = items.reduce((acc, item) => {
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

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'card';

    const media = document.createElement('div');
    media.className = 'card-media';

    const img = document.createElement('img');
    img.alt = item.title;
    img.src = item.thumbnail || 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320"><rect width="100%" height="100%" fill="#e8eef0"/><text x="50%" y="50%" fill="#505861" font-size="22" font-family="Arial" text-anchor="middle" dy=".3em">No thumbnail</text></svg>`);
    media.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.textContent = item.title;

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
}

function render() {
  renderTags();
  renderGallery();
}

searchInput.addEventListener('input', (event) => {
  state.search = event.target.value.toLowerCase();
  renderGallery();
});

fetchItems();
