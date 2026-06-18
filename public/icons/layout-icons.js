const FILL = 'fill="currentColor"';
const MUTED = 'fill="currentColor" opacity="0.55"';

export const LAYOUT_ICON_PATHS = {
  edit: `
    <rect x="4" y="4" width="5" height="4.5" rx="0.5" ${FILL}/>
    <rect x="4" y="9.5" width="5" height="4.5" rx="0.5" ${FILL}/>
    <rect x="4" y="15" width="5" height="4.5" rx="0.5" ${FILL}/>
    <rect x="11" y="4" width="9" height="16" rx="0.5" ${MUTED}/>
  `,
  result: `
    <rect x="4" y="4" width="5" height="4.5" rx="0.5" ${MUTED}/>
    <rect x="10" y="4" width="5" height="4.5" rx="0.5" ${MUTED}/>
    <rect x="16" y="4" width="4" height="4.5" rx="0.5" ${MUTED}/>
    <rect x="4" y="11" width="16" height="9" rx="0.5" ${FILL}/>
  `,
  focus: `
    <rect x="4" y="4" width="16" height="16" rx="0.5" ${FILL}/>
  `,
};

export function renderLayoutIcon(mode, { size = 20 } = {}) {
  const paths = LAYOUT_ICON_PATHS[mode] ?? LAYOUT_ICON_PATHS.edit;
  return `<svg class="layout-icon-svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

export function injectLayoutIcons() {
  const triggerSlot = document.querySelector('#btn-view-layout .view-layout-icon-svg');
  if (triggerSlot) {
    triggerSlot.innerHTML = renderLayoutIcon('edit', { size: 18 });
  }

  document.querySelectorAll('.view-layout-icon[data-workbench-mode]').forEach((btn) => {
    const slot = btn.querySelector('.view-layout-icon-svg');
    if (!slot) return;
    slot.innerHTML = renderLayoutIcon(btn.dataset.workbenchMode, { size: 20 });
  });
}

export function updateTriggerLayoutIcon(mode) {
  const triggerSlot = document.querySelector('#btn-view-layout .view-layout-icon-svg');
  if (!triggerSlot) return;
  triggerSlot.innerHTML = renderLayoutIcon(mode, { size: 18 });
}
