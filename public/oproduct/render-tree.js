function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusLabel(status) {
  if (status === 'done') return 'Done';
  if (status === 'deprecated') return 'Deprecated';
  return 'Plan';
}

export function renderTreeView(doc, container) {
  container.innerHTML = '';
  container.className = 'oproduct-preview oproduct-tree';

  const header = document.createElement('div');
  header.className = 'oproduct-header';
  header.innerHTML = `<h2 class="oproduct-title">${escapeHtml(doc.title || 'Product map')}</h2>`;
  container.appendChild(header);

  const layout = document.createElement('div');
  layout.className = 'oproduct-tree-layout';

  const nav = document.createElement('nav');
  nav.className = 'oproduct-tree-nav';
  nav.setAttribute('aria-label', 'Modules');

  const content = document.createElement('div');
  content.className = 'oproduct-tree-content';

  const modules = doc.views.tree.modules;
  if (!modules.length) {
    content.innerHTML = '<p class="oproduct-empty">No modules defined. Add <code>module</code> blocks under <code>@view tree</code>.</p>';
    layout.appendChild(content);
    container.appendChild(layout);
    return;
  }

  modules.forEach((mod, index) => {
    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.className = `oproduct-module-tab${index === 0 ? ' active' : ''}`;
    navBtn.textContent = mod.name;
    navBtn.dataset.moduleIndex = String(index);
    navBtn.addEventListener('click', () => {
      nav.querySelectorAll('.oproduct-module-tab').forEach((btn) => btn.classList.remove('active'));
      navBtn.classList.add('active');
      content.querySelectorAll('.oproduct-module-panel').forEach((panel) => {
        panel.hidden = panel.dataset.moduleIndex !== String(index);
      });
    });
    nav.appendChild(navBtn);

    const panel = document.createElement('section');
    panel.className = 'oproduct-module-panel';
    panel.dataset.moduleIndex = String(index);
    panel.hidden = index !== 0;

    const panelTitle = document.createElement('h3');
    panelTitle.textContent = mod.name;
    panel.appendChild(panelTitle);

    if (!mod.features.length) {
      const empty = document.createElement('p');
      empty.className = 'oproduct-empty';
      empty.textContent = 'No features in this module.';
      panel.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'oproduct-feature-grid';
      mod.features.forEach((feature) => {
        const card = document.createElement('article');
        card.className = `oproduct-feature-card status-${feature.status}`;
        card.innerHTML = `
          <span class="oproduct-status-pill">${statusLabel(feature.status)}</span>
          <p class="oproduct-feature-text">${escapeHtml(feature.text)}</p>
        `;
        grid.appendChild(card);
      });
      panel.appendChild(grid);
    }

    content.appendChild(panel);
  });

  layout.appendChild(nav);
  layout.appendChild(content);
  container.appendChild(layout);
}
