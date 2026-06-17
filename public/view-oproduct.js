import { parseOproductDocument } from './oproduct/parser.js';
import { renderTreeView } from './oproduct/render-tree.js';
import { renderRoadmapView } from './oproduct/render-roadmap.js';
import { renderJourneyView } from './oproduct/render-journey.js';
import { VIEWS } from './oproduct/model.js';
import { hydrateOfficialRoadmap } from './official-roadmap.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const container = document.getElementById('preview-canvas');
const code = JSON.parse(document.getElementById('diagram-data').textContent);
const parsed = parseOproductDocument(code);

if (!parsed.ok) {
  container.innerHTML = `<div class="preview-error">${escapeHtml(parsed.error)}</div>`;
} else {
  let activeView = VIEWS.includes(parsed.doc.defaultView)
    ? parsed.doc.defaultView
    : 'tree';

  const toolbar = document.getElementById('oproduct-view-toolbar');
  const buttons = toolbar?.querySelectorAll('[data-oproduct-view]') || [];

  function renderView(view) {
    activeView = view;
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.oproductView === view);
      btn.setAttribute('aria-pressed', btn.dataset.oproductView === view ? 'true' : 'false');
    });

    if (view === 'tree') {
      renderTreeView(parsed.doc, container);
    } else if (view === 'roadmap') {
      renderRoadmapView(parsed.doc, container);
    } else {
      renderJourneyView(parsed.doc, container);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => renderView(btn.dataset.oproductView));
  });

  renderView(activeView);

  hydrateOfficialRoadmap(parsed.doc).then((result) => {
    if (result.ok && activeView === 'roadmap') {
      renderView('roadmap');
    }
  });
}

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
}, { capture: true });
