const detailTitle = document.getElementById('detailTitle');
const detailDescription = document.getElementById('detailDescription');
const detailTags = document.getElementById('detailTags');
const detailFrame = document.getElementById('detailFrame');
const DATA_FALLBACK = 'data/pocs.json';

async function fetchItems() {
  try {
    const res = await fetch('/api/pocs');
    if (!res.ok) {
      throw new Error('API not available');
    }
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items || []);
  } catch (err) {
    const res = await fetch(DATA_FALLBACK);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items || []);
  }
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

  if (!item) {
    detailTitle.textContent = 'POC not found';
    detailDescription.textContent = 'Return to the gallery and choose another POC.';
    return;
  }

  detailTitle.textContent = item.title;
  detailDescription.textContent = item.description || '';
  detailTags.innerHTML = '';
  item.tags.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    detailTags.appendChild(chip);
  });
  detailFrame.srcdoc = item.code;

}

loadDetail();
