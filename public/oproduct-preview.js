import { parseOproductDocument } from './oproduct/parser.js';
import { renderTreeView } from './oproduct/render-tree.js';
import { renderRoadmapView } from './oproduct/render-roadmap.js';
import { renderJourneyView } from './oproduct/render-journey.js';
import { VIEWS } from './oproduct/model.js';

const VIEW_STORAGE_KEY = 'odogram-oproduct-view';

let activeView = 'tree';
let activeDoc = null;
let activeContainer = null;
let viewButtons = [];
let viewButtonsBound = false;
let onViewChangeFn = null;
let sourceHandlers = null;

function dispatchFormatChange(format) {
  window.dispatchEvent(new CustomEvent('odogram:format-change', { detail: { format } }));
}

function syncViewButtons() {
  viewButtons.forEach((btn) => {
    const isActive = btn.dataset.oproductView === activeView;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function setViewSwitcherVisible(visible) {
  const switcher = document.querySelector('.oproduct-view-switch');
  if (switcher) {
    switcher.hidden = !visible;
  }
}

function getRoadmapRenderOptions() {
  if (!sourceHandlers) return {};

  return {
    editable: true,
    dndHandlers: {
      getSource: sourceHandlers.getSource,
      setSource: sourceHandlers.setSource,
      onSourcePatched: handleRoadmapSourcePatched,
    },
  };
}

function handleRoadmapSourcePatched() {
  if (!sourceHandlers || !activeContainer) return;

  const parsed = parseOproductDocument(sourceHandlers.getSource());
  if (!parsed.ok) return;

  activeDoc = parsed.doc;

  if (activeView === 'roadmap') {
    renderActiveView(activeContainer);
  }
}

function renderActiveView(container) {
  if (!activeDoc) return;

  if (activeView === 'tree') {
    renderTreeView(activeDoc, container);
  } else if (activeView === 'roadmap') {
    renderRoadmapView(activeDoc, container, getRoadmapRenderOptions());
  } else {
    renderJourneyView(activeDoc, container);
  }
}

function setActiveView(view, { persist = true, container } = {}) {
  if (!VIEWS.includes(view)) return;
  activeView = view;
  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }
  syncViewButtons();
  if (container) {
    renderActiveView(container);
  }
  onViewChangeFn?.(view);
}

function bindViewButtons() {
  if (viewButtonsBound) return;
  viewButtonsBound = true;
  viewButtons = Array.from(document.querySelectorAll('[data-oproduct-view]'));
  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveView(btn.dataset.oproductView, { container: activeContainer });
    });
  });
}

export function initOproductViewSwitcher(containerEl) {
  activeContainer = containerEl;
  bindViewButtons();
}

export function detachOproductPreview() {
  activeDoc = null;
  sourceHandlers = null;
  setViewSwitcherVisible(false);
  dispatchFormatChange('mermaid');
}

export function renderOproductPreview({
  code,
  container,
  escapeHtml,
  onViewChange,
  getSource,
  setSource,
}) {
  activeContainer = container;
  onViewChangeFn = onViewChange || null;
  sourceHandlers = getSource && setSource ? { getSource, setSource } : null;

  const parsed = parseOproductDocument(code);

  if (!parsed.ok) {
    container.innerHTML = `<div class="preview-error">${escapeHtml(parsed.error)}</div>`;
    container.className = 'oproduct-preview-error';
    setViewSwitcherVisible(false);
    dispatchFormatChange('oproduct');
    return { ok: false };
  }

  activeDoc = parsed.doc;
  const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
  const initialView = VIEWS.includes(savedView) ? savedView : activeDoc.defaultView;
  activeView = VIEWS.includes(initialView) ? initialView : 'tree';

  setViewSwitcherVisible(true);
  syncViewButtons();
  renderActiveView(container);
  dispatchFormatChange('oproduct');

  return { ok: true, view: activeView };
}

export function getOproductActiveView() {
  return activeView;
}
