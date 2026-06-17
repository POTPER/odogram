const SPLIT_KEY = 'odogram-split';
const SIDEBAR_KEY = 'odogram-sidebar-open';
const MODE_KEY = 'odogram-workbench-mode';
const VALID_MODES = ['edit', 'focus', 'result'];
const MOBILE_MQ = window.matchMedia('(max-width: 768px)');

function dispatchPreviewResize() {
  window.dispatchEvent(new CustomEvent('odogram:preview-resize'));
}

function clampSplit(value) {
  return Math.min(80, Math.max(20, value));
}

function normalizeMode(mode) {
  return VALID_MODES.includes(mode) ? mode : 'edit';
}

export function initLayoutUI() {
  const resizer = document.getElementById('pane-resizer');
  const sidebarToggle = document.getElementById('btn-sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const tabSource = document.getElementById('tab-source');
  const tabPreview = document.getElementById('tab-preview');
  const diagramList = document.getElementById('diagram-list');
  const workbench = document.querySelector('.workbench');
  const root = document.documentElement;
  const modeButtons = document.querySelectorAll('[data-workbench-mode]');
  const focusExpandBtn = document.getElementById('btn-focus-expand');
  const expandSourceBtn = document.getElementById('btn-expand-source');
  const sourceHeaderLabel = document.getElementById('source-header-label');

  const savedSplit = localStorage.getItem(SPLIT_KEY);
  if (savedSplit) {
    root.style.setProperty('--split', clampSplit(Number(savedSplit)).toString());
  }

  let currentMode = normalizeMode(localStorage.getItem(MODE_KEY) || 'edit');

  function isMobile() {
    return MOBILE_MQ.matches;
  }

  function getCurrentSplit() {
    return Number(getComputedStyle(root).getPropertyValue('--split')) || 50;
  }

  function applyModeClasses(mode) {
    document.body.classList.toggle('mode-edit', mode === 'edit');
    document.body.classList.toggle('mode-focus', mode === 'focus');
    document.body.classList.toggle('mode-result', mode === 'result');
  }

  function updateModeUI() {
    const desktop = !isMobile();
    modeButtons.forEach((btn) => {
      const active = desktop && btn.dataset.workbenchMode === currentMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (focusExpandBtn) {
      focusExpandBtn.hidden = !desktop || currentMode !== 'focus';
    }
    if (expandSourceBtn) {
      expandSourceBtn.hidden = !desktop || currentMode !== 'result';
    }
    if (sourceHeaderLabel) {
      sourceHeaderLabel.textContent = desktop && currentMode === 'result' ? 'Source (compact)' : 'Source';
    }
  }

  function setWorkbenchMode(mode, { persist = true, resize = true } = {}) {
    mode = normalizeMode(mode);

    if (isMobile()) {
      currentMode = mode;
      if (persist) {
        localStorage.setItem(MODE_KEY, mode);
      }
      return;
    }

    if (currentMode === 'edit' && mode !== 'edit') {
      saveSplit(getCurrentSplit());
    }

    currentMode = mode;
    applyModeClasses(mode);
    updateModeUI();

    if (persist) {
      localStorage.setItem(MODE_KEY, mode);
    }
    if (resize) {
      dispatchPreviewResize();
    }
  }

  function syncWorkbenchMode() {
    if (isMobile()) {
      document.body.classList.remove('mode-edit', 'mode-focus', 'mode-result');
      updateModeUI();
      dispatchPreviewResize();
      return;
    }

    applyModeClasses(currentMode);
    updateModeUI();
    dispatchPreviewResize();
  }

  function updateBackdrop() {
    if (!backdrop) return;
    backdrop.hidden = !document.body.classList.contains('sidebar-open') || !isMobile();
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    updateBackdrop();
    if (!isMobile()) {
      localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0');
    }
  }

  function syncSidebarToggle() {
    const loggedIn = sidebar.classList.contains('visible');
    sidebarToggle.hidden = !loggedIn;
    if (!loggedIn) {
      document.body.classList.remove('sidebar-open');
      updateBackdrop();
      return;
    }

    if (!document.body.dataset.sidebarInitialized) {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      setSidebarOpen(saved !== '0');
      document.body.dataset.sidebarInitialized = '1';
    }
    updateBackdrop();
  }

  sidebarToggle.addEventListener('click', () => {
    setSidebarOpen(!document.body.classList.contains('sidebar-open'));
  });

  backdrop?.addEventListener('click', () => setSidebarOpen(false));

  diagramList?.addEventListener('click', (event) => {
    if (event.target.closest('button') && isMobile()) {
      setSidebarOpen(false);
    }
  });

  function setSplit(value) {
    const split = clampSplit(value);
    root.style.setProperty('--split', String(split));
    return split;
  }

  function saveSplit(value) {
    localStorage.setItem(SPLIT_KEY, String(value));
  }

  let dragging = false;

  function onPointerMove(event) {
    if (!dragging || !workbench || currentMode !== 'edit') return;
    const rect = workbench.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    setSplit(pct);
  }

  function onPointerUp(event) {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-resizing');
    resizer.classList.remove('is-active');
    if (resizer.hasPointerCapture(event.pointerId)) {
      resizer.releasePointerCapture(event.pointerId);
    }
    saveSplit(getCurrentSplit());
    dispatchPreviewResize();
  }

  resizer?.addEventListener('pointerdown', (event) => {
    if (isMobile() || currentMode !== 'edit') return;
    dragging = true;
    document.body.classList.add('is-resizing');
    resizer.classList.add('is-active');
    resizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  resizer?.addEventListener('pointermove', onPointerMove);
  resizer?.addEventListener('pointerup', onPointerUp);
  resizer?.addEventListener('pointercancel', onPointerUp);

  resizer?.addEventListener('keydown', (event) => {
    if (isMobile() || currentMode !== 'edit') return;
    const current = getCurrentSplit();
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const split = setSplit(current - 2);
      saveSplit(split);
      dispatchPreviewResize();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const split = setSplit(current + 2);
      saveSplit(split);
      dispatchPreviewResize();
    }
  });

  function activateTab(tab) {
    const isSource = tab === 'source';
    document.body.classList.toggle('tab-source', isSource);
    document.body.classList.toggle('tab-preview', !isSource);
    tabSource.classList.toggle('active', isSource);
    tabPreview.classList.toggle('active', !isSource);
    tabSource.setAttribute('aria-selected', isSource ? 'true' : 'false');
    tabPreview.setAttribute('aria-selected', isSource ? 'false' : 'true');
    if (!isSource) {
      dispatchPreviewResize();
    }
  }

  tabSource?.addEventListener('click', () => activateTab('source'));
  tabPreview?.addEventListener('click', () => activateTab('preview'));

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setWorkbenchMode(btn.dataset.workbenchMode);
    });
  });

  focusExpandBtn?.addEventListener('click', () => {
    setWorkbenchMode('edit');
  });

  expandSourceBtn?.addEventListener('click', () => {
    setWorkbenchMode('edit');
  });

  window.addEventListener('resize', () => {
    updateBackdrop();
    syncWorkbenchMode();
  });

  MOBILE_MQ.addEventListener('change', () => {
    updateBackdrop();
    syncWorkbenchMode();
  });

  syncSidebarToggle();
  syncWorkbenchMode();

  return {
    syncSidebarToggle,
    openSidebar: () => setSidebarOpen(true),
    setWorkbenchMode,
    getWorkbenchMode: () => currentMode,
  };
}
