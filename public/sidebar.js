const SIDEBAR_STORAGE_KEY = 'wds-sidebar-collapsed';

function initCollapsibleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const mobileQuery = window.matchMedia('(max-width: 960px)');
  const links = Array.from(sidebar.querySelectorAll('.side-link'));

  links.forEach((link) => {
    const label = link.querySelector('span')?.textContent?.trim() || link.getAttribute('aria-label') || '';
    if (label) {
      link.dataset.tooltip = label;
      link.setAttribute('title', label);
      link.setAttribute('aria-label', label);
    }
  });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sidebar-collapse-toggle';
  toggle.setAttribute('aria-label', 'Collapse sidebar');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 7.4 10.8 12l4.6 4.6-1.4 1.4L8 12l6-6z"/></svg>';

  sidebar.appendChild(toggle);

  const applyState = (collapsed, persist = true) => {
    const shouldCollapse = !mobileQuery.matches && collapsed;
    document.body.classList.toggle('sidebar-collapsed', shouldCollapse);
    toggle.setAttribute('aria-pressed', shouldCollapse ? 'true' : 'false');
    toggle.setAttribute('aria-label', shouldCollapse ? 'Expand sidebar' : 'Collapse sidebar');
    if (persist) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, shouldCollapse ? '1' : '0');
    }
  };

  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  applyState(stored, false);

  toggle.addEventListener('click', () => {
    const currentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
    applyState(!currentlyCollapsed, true);
  });

  const onMediaChange = () => {
    if (mobileQuery.matches) {
      document.body.classList.remove('sidebar-collapsed');
      return;
    }
    applyState(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1', false);
  };

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', onMediaChange);
  } else {
    mobileQuery.addListener(onMediaChange);
  }
}

initCollapsibleSidebar();
