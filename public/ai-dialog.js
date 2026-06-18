import { ctx } from './app-context.js';

const btnAiAssistant = document.getElementById('btn-ai-assistant');
const aiDialogBackdrop = document.getElementById('ai-dialog-backdrop');
const aiDialog = document.getElementById('ai-dialog');
const aiDialogClose = document.getElementById('ai-dialog-close');

function onAiDialogKeydown(event) {
  if (aiDialogBackdrop.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAiDialog();
  }
}

export function openAiDialog() {
  if (!aiDialogBackdrop) return;
  ctx.layoutUI?.setViewLayoutOpen?.(false);
  ctx.settingsUI?.setSettingsOpen?.(false);
  ctx.shareUI?.setShareOpen?.(false);
  ctx.closeLoginDialog?.();
  aiDialogBackdrop.hidden = false;
  document.addEventListener('keydown', onAiDialogKeydown);
  aiDialogClose?.focus();
}

export function closeAiDialog() {
  if (!aiDialogBackdrop) return;
  aiDialogBackdrop.hidden = true;
  document.removeEventListener('keydown', onAiDialogKeydown);
}

export function initAiDialog() {
  btnAiAssistant?.addEventListener('click', (event) => {
    event.stopPropagation();
    openAiDialog();
  });

  aiDialogClose?.addEventListener('click', () => closeAiDialog());

  aiDialogBackdrop?.addEventListener('click', (event) => {
    if (event.target === aiDialogBackdrop) closeAiDialog();
  });

  aiDialog?.addEventListener('click', (event) => event.stopPropagation());
}
