import { ctx } from './app-context.js';

const btnStatusAssets = document.getElementById('btn-status-assets');
const assetsPanelBackdrop = document.getElementById('assets-panel-backdrop');
const assetsPanel = document.getElementById('assets-panel');
const assetsPanelClose = document.getElementById('assets-panel-close');

function onAssetsPanelKeydown(event) {
  if (assetsPanelBackdrop?.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAssetsPanel();
  }
}

export function openAssetsPanel() {
  if (!assetsPanelBackdrop) return;

  ctx.layoutUI?.setViewLayoutOpen?.(false);
  ctx.layoutUI?.setSidebarOpen?.(false);
  ctx.settingsUI?.setSettingsOpen?.(false);
  ctx.shareUI?.setShareOpen?.(false);
  ctx.authUI?.setUserMenuOpen?.(false);
  ctx.closeLoginDialog?.();
  ctx.closeAiDialog?.();
  ctx.closeConsoleLogPanel?.();

  assetsPanelBackdrop.hidden = false;
  document.addEventListener('keydown', onAssetsPanelKeydown);
  assetsPanelClose?.focus();
}

export function closeAssetsPanel() {
  if (!assetsPanelBackdrop) return;
  assetsPanelBackdrop.hidden = true;
  document.removeEventListener('keydown', onAssetsPanelKeydown);
}

export function initAssetsPanel() {
  btnStatusAssets?.addEventListener('click', (event) => {
    event.stopPropagation();
    openAssetsPanel();
  });

  assetsPanelClose?.addEventListener('click', () => closeAssetsPanel());

  assetsPanelBackdrop?.addEventListener('click', (event) => {
    if (event.target === assetsPanelBackdrop) closeAssetsPanel();
  });

  assetsPanel?.addEventListener('click', (event) => event.stopPropagation());
}
