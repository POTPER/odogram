import { bindRoadmapDnD } from './roadmap-dnd.js';
import { escapeHtml } from '../escape-html.js';
import { statusLabel } from './render-utils.js';

export function renderRoadmapView(doc, container, options = {}) {
  const { editable = true, dndHandlers = null } = options;
  const isReadonly = !editable;

  container.innerHTML = '';
  container.className = 'oproduct-preview oproduct-roadmap';
  if (isReadonly) {
    container.classList.add('oproduct-roadmap-readonly');
  }

  const header = document.createElement('div');
  header.className = 'oproduct-header';
  header.innerHTML = `<h2 class="oproduct-title">${escapeHtml(doc.title || 'Roadmap')}</h2>`;
  container.appendChild(header);

  const milestones = doc.views.roadmap.milestones;
  if (!milestones.length) {
    const empty = document.createElement('p');
    empty.className = 'oproduct-empty';
    empty.textContent = 'No milestones defined. Add milestone blocks under @view roadmap.';
    container.appendChild(empty);
    return;
  }

  const timeline = document.createElement('div');
  timeline.className = 'oproduct-roadmap-timeline';

  milestones.forEach((milestone, milestoneIndex) => {
    const block = document.createElement('section');
    block.className = 'oproduct-milestone';
    block.dataset.milestoneIndex = String(milestoneIndex);

    const head = document.createElement('div');
    head.className = 'oproduct-milestone-head';

    if (!isReadonly) {
      const handle = document.createElement('span');
      handle.className = 'oproduct-drag-handle oproduct-milestone-handle';
      handle.draggable = true;
      handle.setAttribute('aria-label', 'Drag milestone');
      handle.textContent = '⋮⋮';
      head.appendChild(handle);
    }

    const title = document.createElement('h3');
    title.className = 'oproduct-milestone-title';
    title.textContent = milestone.id;
    head.appendChild(title);
    block.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'oproduct-deliver-list';
    list.dataset.milestoneIndex = String(milestoneIndex);

    if (!milestone.delivers.length) {
      const empty = document.createElement('p');
      empty.className = 'oproduct-empty';
      empty.textContent = 'No deliverables.';
      block.appendChild(empty);
    } else {
      milestone.delivers.forEach((deliver, deliverIndex) => {
        const li = document.createElement('li');
        li.className = `oproduct-deliver status-${deliver.status}`;
        li.dataset.milestoneIndex = String(milestoneIndex);
        li.dataset.deliverIndex = String(deliverIndex);
        if (!isReadonly) {
          li.draggable = true;
          li.innerHTML = `
          <span class="oproduct-drag-handle oproduct-deliver-handle" aria-hidden="true">⋮⋮</span>
          <span class="oproduct-status-pill">${statusLabel(deliver.status)}</span>
          <span class="oproduct-deliver-text">${escapeHtml(deliver.text)}</span>
        `;
        } else {
          li.innerHTML = `
          <span class="oproduct-status-pill">${statusLabel(deliver.status)}</span>
          <span class="oproduct-deliver-text">${escapeHtml(deliver.text)}</span>
        `;
        }
        list.appendChild(li);
      });
      block.appendChild(list);
    }

    if (!isReadonly) {
      const appendZone = document.createElement('div');
      appendZone.className = 'oproduct-deliver-append';
      appendZone.dataset.milestoneIndex = String(milestoneIndex);
      appendZone.dataset.dropKind = 'append';
      block.appendChild(appendZone);
    }

    timeline.appendChild(block);
  });

  container.appendChild(timeline);

  if (dndHandlers && !isReadonly) {
    bindRoadmapDnD(container, {
      ...dndHandlers,
      doc,
      editable: true,
    });
  }
}
