import { ctx } from './app-context.js';
import { openLoginDialog } from './login-dialog.js';
import { closeAiDialog } from './ai-dialog.js';
const btnSettings = document.getElementById('btn-settings');
const settingsPopover = document.getElementById('settings-popover');
const settingsAccount = document.getElementById('settings-account');

let settingsOpen = false;
let updateSaveHelpContentFn = () => {};
let escapeHtmlFn = (str) => str;

export function setSettingsOpen(open) {
  settingsOpen = open;
  if (settingsPopover) settingsPopover.hidden = !open;
  if (btnSettings) {
    btnSettings.classList.toggle('active', open);
    btnSettings.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (open) {
    updateSaveHelpContentFn();
    updateSettingsAccount();
    ctx.layoutUI?.setViewLayoutOpen?.(false);
    ctx.authUI?.setUserMenuOpen?.(false);
    ctx.shareUI?.setShareOpen?.(false);
    closeAiDialog();
  }
}
export function toggleSettings(event) {
  event?.stopPropagation();
  setSettingsOpen(!settingsOpen);
}

export function updateSettingsAccount() {
  if (!settingsAccount) return;

  if (ctx.user?.login) {
    settingsAccount.innerHTML = `
      <div class="settings-account-user">
        <img class="settings-account-avatar" src="${escapeHtmlFn(ctx.user.avatar)}" alt="" width="32" height="32">
        <span class="settings-account-name">${escapeHtmlFn(ctx.user.username)}</span>
      </div>
      <button type="button" id="settings-logout-btn" class="settings-account-action">退出登录</button>
    `;
    settingsAccount.querySelector('#settings-logout-btn')?.addEventListener('click', () => {
      window.location.href = '/auth/logout';
    });
  } else {
    settingsAccount.innerHTML = `
      <p class="settings-hint">登录后可将图表保存到 GitHub Issue。</p>
      <button type="button" id="settings-login-btn" class="settings-account-action primary">去登录</button>
    `;
    settingsAccount.querySelector('#settings-login-btn')?.addEventListener('click', () => {
      setSettingsOpen(false);
      openLoginDialog();
    });
  }
}

export function initSettingsUI({ updateSaveHelpContent, escapeHtml } = {}) {
  updateSaveHelpContentFn = updateSaveHelpContent ?? updateSaveHelpContentFn;
  escapeHtmlFn = escapeHtml ?? escapeHtmlFn;

  btnSettings?.addEventListener('click', toggleSettings);
  settingsPopover?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
    if (settingsOpen) setSettingsOpen(false);
  });

  return {
    setSettingsOpen,
    toggleSettings,
    updateSettingsAccount,
  };
}
