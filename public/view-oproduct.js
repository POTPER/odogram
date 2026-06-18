import { parseOproductDocument } from './oproduct/parser.js';
import { renderTreeView } from './oproduct/render-tree.js';
import { renderRoadmapView } from './oproduct/render-roadmap.js';
import { renderJourneyView } from './oproduct/render-journey.js';
import { VIEWS } from './oproduct/model.js';
import { escapeHtml } from './escape-html.js';
import { disableContextMenu } from './view-shared.js';

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
}

disableContextMenu();
