import { escapeHtml } from '../escape-html.js';

export function renderJourneyView(doc, container) {
  container.innerHTML = '';
  container.className = 'oproduct-preview oproduct-journey';

  const header = document.createElement('div');
  header.className = 'oproduct-header';
  header.innerHTML = `<h2 class="oproduct-title">${escapeHtml(doc.title || 'User journey')}</h2>`;
  container.appendChild(header);

  const personas = doc.views.journey.personas;
  if (!personas.length) {
    const empty = document.createElement('p');
    empty.className = 'oproduct-empty';
    empty.textContent = 'No personas defined. Add persona blocks under @view journey.';
    container.appendChild(empty);
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'oproduct-journey-layout';

  personas.forEach((persona) => {
    const section = document.createElement('section');
    section.className = 'oproduct-persona';

    const title = document.createElement('h3');
    title.className = 'oproduct-persona-title';
    title.textContent = persona.name;
    section.appendChild(title);

    if (!persona.steps.length) {
      const empty = document.createElement('p');
      empty.className = 'oproduct-empty';
      empty.textContent = 'No steps defined.';
      section.appendChild(empty);
    } else {
      const steps = document.createElement('ol');
      steps.className = 'oproduct-step-list';
      persona.steps.forEach((step) => {
        const li = document.createElement('li');
        li.className = 'oproduct-step';
        li.innerHTML = `
          <span class="oproduct-step-action">${escapeHtml(step.action)}</span>
          <span class="oproduct-step-arrow" aria-hidden="true">→</span>
          <span class="oproduct-step-touchpoint">${escapeHtml(step.touchpoint)}</span>
        `;
        steps.appendChild(li);
      });
      section.appendChild(steps);
    }

    layout.appendChild(section);
  });

  container.appendChild(layout);
}
