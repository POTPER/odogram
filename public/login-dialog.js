import { ctx } from './app-context.js';

const btnLogin = document.getElementById('btn-login');
const loginDialogBackdrop = document.getElementById('login-dialog-backdrop');
const loginDialog = document.getElementById('login-dialog');
const btnLoginGithub = document.getElementById('btn-login-github');
const loginDialogCancel = document.getElementById('login-dialog-cancel');

// GitLab: wire to `/auth/login/gitlab` when OAuth is implemented

function onLoginDialogKeydown(event) {
  if (loginDialogBackdrop.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeLoginDialog();
  }
}

export function openLoginDialog() {
  if (!loginDialogBackdrop) return;
  ctx.layoutUI?.setViewLayoutOpen?.(false);
  ctx.settingsUI?.setSettingsOpen?.(false);
  ctx.shareUI?.setShareOpen?.(false);
  ctx.closeAiDialog?.();
  loginDialogBackdrop.hidden = false;
  document.addEventListener('keydown', onLoginDialogKeydown);
  btnLoginGithub?.focus();
}

export function closeLoginDialog() {
  if (!loginDialogBackdrop) return;
  loginDialogBackdrop.hidden = true;
  document.removeEventListener('keydown', onLoginDialogKeydown);
}

export function initLoginDialog() {
  btnLogin?.addEventListener('click', (event) => {
    event.stopPropagation();
    openLoginDialog();
  });

  btnLoginGithub?.addEventListener('click', () => {
    window.location.href = '/auth/login';
  });

  loginDialogCancel?.addEventListener('click', () => closeLoginDialog());

  loginDialogBackdrop?.addEventListener('click', (event) => {
    if (event.target === loginDialogBackdrop) closeLoginDialog();
  });

  loginDialog?.addEventListener('click', (event) => event.stopPropagation());
}
