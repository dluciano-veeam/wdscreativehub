const clientTitle = document.getElementById('clientTitle');
const clientSubtitle = document.getElementById('clientSubtitle');
const clientCrumb = document.getElementById('clientCrumb');
const clientSiteLink = document.getElementById('clientSiteLink');
const kpiRow = document.getElementById('kpiRow');
const updatesTimeline = document.getElementById('updatesTimeline');
const snapshotImage = document.getElementById('snapshotImage');
const baselineNote = document.getElementById('baselineNote');

const COMPETITORS_FALLBACK = 'data/competitors.json?v=1';
const UPDATES_FALLBACK = 'data/competitive-updates.json?v=1';
const params = new URLSearchParams(window.location.search);
const competitorId = params.get('id') || 'rubrik';
const HEURISTIC_MODEL_VERSION = 'v1.0';

const HEURISTIC_FORMULA = {
  ui: {
    base: 30,
    impact: { high: 20, medium: 12, low: 6 },
    keywordBoost: 3,
    keywordCap: 24,
    keywords: [
      'hero', 'layout', 'visual', 'design', 'component', 'cta', 'typography',
      'section', 'grid', 'card', 'style', 'module', 'navigation'
    ]
  },
  ux: {
    base: 28,
    impact: { high: 22, medium: 14, low: 8 },
    keywordBoost: 4,
    keywordCap: 28,
    keywords: [
      'journey', 'flow', 'navigation', 'discover', 'exploration', 'progressive',
      'interaction', 'friction', 'path', 'scannable', 'taxonomy', 'information architecture'
    ]
  },
  functionality: {
    base: 20,
    impact: { high: 24, medium: 14, low: 8 },
    keywordBoost: 5,
    keywordCap: 35,
    keywords: [
      'feature', 'function', 'capability', 'platform', 'integration', 'video',
      'search', 'filter', 'product', 'solution', 'hook'
    ]
  }
};

function normalizeItems(data) {
  return Array.isArray(data) ? data : (data.items || []);
}

function getImpactClass(value) {
  const norm = (value || '').toLowerCase();
  if (norm === 'high') return 'impact-high';
  if (norm === 'medium') return 'impact-medium';
  return 'impact-low';
}

function toDate(value) {
  if (!value) return '-';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

function getLiveThumb(website) {
  if (!website) return '';
  const encoded = encodeURIComponent(website);
  return `https://image.thum.io/get/width/1500/noanimate/${encoded}`;
}

function getSnapshotFallback(name) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="760"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#131e2b"/><stop offset="100%" stop-color="#0b5f37"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><text x="50%" y="46%" fill="#9CFFA3" font-size="50" font-family="Arial, sans-serif" text-anchor="middle">${name}</text><text x="50%" y="56%" fill="#ccd9e7" font-size="24" font-family="Arial, sans-serif" text-anchor="middle">Snapshot unavailable</text></svg>`
  );
}

function toAbsoluteUrl(maybeRelative) {
  if (!maybeRelative) return '';
  if (/^https?:\/\//i.test(maybeRelative) || maybeRelative.startsWith('data:')) {
    return maybeRelative;
  }
  return `${window.location.origin}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countKeywordHits(haystack, keywords) {
  return keywords.reduce((count, keyword) => {
    return haystack.includes(keyword) ? count + 1 : count;
  }, 0);
}

function computeMetricScore(metricName, item, haystack) {
  const cfg = HEURISTIC_FORMULA[metricName];
  const impactKey = (item.impact || 'low').toLowerCase();
  const impactBoost = cfg.impact[impactKey] || cfg.impact.low;
  const keywordHits = countKeywordHits(haystack, cfg.keywords);
  const keywordPoints = Math.min(cfg.keywordCap, keywordHits * cfg.keywordBoost);
  const hasBeforeAfter = Boolean(item.evidence?.before && item.evidence?.after);
  const comparisonBoost = hasBeforeAfter ? 8 : 0;
  const rawScore = cfg.base + impactBoost + keywordPoints + comparisonBoost;
  const score = clampScore(rawScore);

  return {
    score,
    detail: `Model ${HEURISTIC_MODEL_VERSION}: base ${cfg.base} + impact ${impactBoost} + keywords ${keywordPoints}${comparisonBoost ? ` + comparison ${comparisonBoost}` : ''} = ${score}`
  };
}

function computeHeuristicMetrics(item) {
  const textPool = [
    item.title,
    item.summary,
    ...(item.signals || []),
    ...(item.technicalNotes || [])
  ]
    .join(' ')
    .toLowerCase();

  const ui = computeMetricScore('ui', item, textPool);
  const ux = computeMetricScore('ux', item, textPool);
  const functionality = computeMetricScore('functionality', item, textPool);

  return {
    ui: ui.score,
    ux: ux.score,
    functionality: functionality.score,
    explanations: {
      ui: ui.detail,
      ux: ux.detail,
      functionality: functionality.detail
    }
  };
}

async function fetchCompetitor() {
  try {
    const res = await fetch('/api/competitors');
    if (!res.ok) throw new Error('api unavailable');
    const data = await res.json();
    return normalizeItems(data).find((item) => item.id === competitorId) || null;
  } catch {
    const res = await fetch(COMPETITORS_FALLBACK);
    const data = await res.json();
    return normalizeItems(data).find((item) => item.id === competitorId) || null;
  }
}

async function fetchUpdates() {
  try {
    const res = await fetch(`/api/competitors/${encodeURIComponent(competitorId)}/updates`);
    if (!res.ok) throw new Error('api unavailable');
    const data = await res.json();
    return normalizeItems(data);
  } catch {
    const res = await fetch(UPDATES_FALLBACK);
    const data = await res.json();
    return normalizeItems(data).filter((item) => item.competitorId === competitorId);
  }
}

function renderKpis(competitor, updates) {
  const high = updates.filter((item) => (item.impact || '').toLowerCase() === 'high').length;
  const medium = updates.filter((item) => (item.impact || '').toLowerCase() === 'medium').length;
  const low = updates.filter((item) => (item.impact || '').toLowerCase() === 'low').length;

  const cards = [
    { label: 'Tracked since', value: competitor.trackingSince || '-' },
    { label: 'Technical updates', value: String(updates.length) },
    { label: 'High impact', value: String(high) },
    { label: 'Medium impact', value: String(medium) },
    { label: 'Low impact', value: String(low) }
  ];

  kpiRow.innerHTML = '';
  cards.forEach((card) => {
    const el = document.createElement('article');
    el.className = 'competitive-kpi';
    el.innerHTML = `<div class="competitive-kpi-label">${card.label}</div><div class="competitive-kpi-value">${card.value}</div>`;
    kpiRow.appendChild(el);
  });
}

function renderUpdates(updates, competitor) {
  updatesTimeline.innerHTML = '';
  if (baselineNote) {
    const onlyBaseline = updates.length > 0 && updates.every((item) => item.type === 'baseline');
    if (onlyBaseline) {
      baselineNote.textContent = 'Baseline phase: this is the initial UI/UX feature inventory. Historical comparison entries will appear after the next scan cycle.';
      baselineNote.classList.remove('hidden');
    } else {
      baselineNote.classList.add('hidden');
      baselineNote.textContent = '';
    }
  }

  if (!updates.length) {
    const empty = document.createElement('p');
    empty.className = 'competitive-empty';
    empty.textContent = 'No technical UI/UX changes detected yet for this competitor.';
    updatesTimeline.appendChild(empty);
    return;
  }

  updates.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'competitive-update-card';

    const tags = (item.signals || [])
      .map((signal) => `<span class="tag-chip">${signal}</span>`)
      .join('');

    const notes = (item.technicalNotes || [])
      .map((note) => `<li>${note}</li>`)
      .join('');

    const evidenceAfter = item.evidence?.after || getLiveThumb(competitor.website) || competitor.thumbnail;
    const evidenceBefore = item.evidence?.before || '';
    const codePayload = JSON.stringify({
      id: item.id,
      type: item.type,
      impact: item.impact,
      capturedAt: item.capturedAt,
      signals: item.signals || []
    }, null, 2);
    const metrics = computeHeuristicMetrics(item);
    const ui = metrics.ui;
    const ux = metrics.ux;
    const functionality = metrics.functionality;
    const uiTip = metrics.explanations.ui;
    const uxTip = metrics.explanations.ux;
    const funcTip = metrics.explanations.functionality;

    row.innerHTML = `
      <header class="competitive-update-head">
        <div>
          <p class="competitive-update-date">${toDate(item.capturedAt)}</p>
          <h4>${item.title || 'Untitled update'}</h4>
        </div>
        <span class="competitive-impact ${getImpactClass(item.impact)}">${item.impact || 'low'} impact</span>
      </header>
      <p class="competitive-update-summary">${item.summary || ''}</p>
      <div class="competitive-metrics">
        <div class="metric-row">
          <span>UI <button class="metric-tip" type="button" data-tip="${uiTip.replace(/"/g, '&quot;')}" aria-label="Explain UI score">i</button></span>
          <div class="metric-track"><i style="width:${ui}%"></i></div>
          <strong>${ui}</strong>
        </div>
        <div class="metric-row">
          <span>UX <button class="metric-tip" type="button" data-tip="${uxTip.replace(/"/g, '&quot;')}" aria-label="Explain UX score">i</button></span>
          <div class="metric-track"><i style="width:${ux}%"></i></div>
          <strong>${ux}</strong>
        </div>
        <div class="metric-row">
          <span>Functionality <button class="metric-tip" type="button" data-tip="${funcTip.replace(/"/g, '&quot;')}" aria-label="Explain Functionality score">i</button></span>
          <div class="metric-track"><i style="width:${functionality}%"></i></div>
          <strong>${functionality}</strong>
        </div>
      </div>
      <div class="competitive-evidence">
        ${evidenceBefore ? `<figure class="competitive-evidence-item"><img src="${toAbsoluteUrl(evidenceBefore)}" alt="Previous snapshot evidence"><figcaption>Before</figcaption></figure>` : ''}
        <figure class="competitive-evidence-item">
          <img src="${toAbsoluteUrl(evidenceAfter)}" alt="Current snapshot evidence">
          <figcaption>${evidenceBefore ? 'After' : 'Current evidence'}</figcaption>
        </figure>
      </div>
      <div class="tag-row">${tags}</div>
      <ul class="competitive-notes">${notes}</ul>
      <details class="competitive-code-block">
        <summary>View technical payload</summary>
        <pre><code>${codePayload}</code></pre>
      </details>
    `;

    row.querySelectorAll('.competitive-evidence img').forEach((img) => {
      img.addEventListener('error', () => {
        img.src = getSnapshotFallback(competitor.name || 'Competitor');
      }, { once: true });
    });

    updatesTimeline.appendChild(row);
  });
}

async function init() {
  const [competitor, updates] = await Promise.all([fetchCompetitor(), fetchUpdates()]);

  if (!competitor) {
    clientTitle.textContent = 'Competitor not found';
    clientSubtitle.textContent = 'This competitor is not configured in the current dataset.';
    return;
  }

  clientTitle.textContent = competitor.name || 'Competitor';
  clientCrumb.textContent = competitor.name || 'Competitor';
  clientSubtitle.textContent = `${competitor.category || 'Category not set'} • ${competitor.region || 'Region not set'}`;

  clientSiteLink.href = competitor.website || '#';
  const liveSnapshot = competitor.liveSnapshot || getLiveThumb(competitor.website);
  const localThumb = competitor.thumbnail || '';
  const fallback = getSnapshotFallback(competitor.name || 'Competitor');
  let usedLocalThumb = false;
  snapshotImage.src = liveSnapshot || localThumb || fallback;
  snapshotImage.alt = `${competitor.name || 'Competitor'} latest homepage snapshot`;
  snapshotImage.addEventListener('error', () => {
    if (!usedLocalThumb && localThumb) {
      snapshotImage.src = toAbsoluteUrl(localThumb);
      usedLocalThumb = true;
      return;
    }
    snapshotImage.src = fallback;
  });

  renderKpis(competitor, updates);
  renderUpdates(updates, competitor);
}

init();
