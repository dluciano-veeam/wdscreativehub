const detailTitle = document.getElementById('detailTitle');
const detailDescription = document.getElementById('detailDescription');
const detailTags = document.getElementById('detailTags');
const detailFrame = document.getElementById('detailFrame');
const editBtn = document.getElementById('editBtn');

async function loadDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    detailTitle.textContent = 'POC not found';
    return;
  }

  const res = await fetch('/api/pocs');
  const items = await res.json();
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

  editBtn.addEventListener('click', () => {
    window.location.href = `/?edit=${item.id}`;
  });
}

loadDetail();
