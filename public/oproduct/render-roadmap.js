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

export function renderRoadmapView(doc, container) {
  container.innerHTML = '';
  container.className = 'oproduct-preview oproduct-roadmap';

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

  milestones.forEach((milestone) => {
    const block = document.createElement('section');
    block.className = 'oproduct-milestone';

    const title = document.createElement('h3');
    title.className = 'oproduct-milestone-title';
    title.textContent = milestone.id;
    block.appendChild(title);

    if (!milestone.delivers.length) {
      const empty = document.createElement('p');
      empty.className = 'oproduct-empty';
      empty.textContent = 'No deliverables.';
      block.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'oproduct-deliver-list';
      milestone.delivers.forEach((deliver) => {
        const li = document.createElement('li');
        li.className = `oproduct-deliver status-${deliver.status}`;
        li.innerHTML = `
          <span class="oproduct-status-pill">${statusLabel(deliver.status)}</span>
          <span class="oproduct-deliver-text">${escapeHtml(deliver.text)}</span>
        `;
        list.appendChild(li);
      });
      block.appendChild(list);
    }

    timeline.appendChild(block);
  });

  container.appendChild(timeline);
}
