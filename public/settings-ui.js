import { ctx } from './app-context.js';
import { openLoginDialog } from './login-dialog.js';
import { closeAiDialog } from './ai-dialog.js';

const btnSettings = document.getElementById('btn-settings');
const settingsPanelBackdrop = document.getElementById('settings-panel-backdrop');
const settingsPanel = document.getElementById('settings-panel');
const settingsPanelClose = document.getElementById('settings-panel-close');
const settingsPanelDone = document.getElementById('settings-panel-done');
const settingsNavItems = document.querySelectorAll('.settings-nav-item');
const settingsPanes = document.querySelectorAll('.settings-pane');
const settingsAccount = document.getElementById('settings-account');

let settingsOpen = false;
let updateSaveHelpContentFn = () => {};
let escapeHtmlFn = (str) => str;

function onSettingsPanelKeydown(event) {
  if (settingsPanelBackdrop?.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setSettingsOpen(false);
  }
}

function setActiveSettingsPane(paneId) {
  settingsNavItems.forEach((item) => {
    const active = item.dataset.settingsPane === paneId;
    item.classList.toggle('active', active);
  });
  settingsPanes.forEach((pane) => {
    pane.classList.toggle('active', pane.id === `settings-pane-${paneId}`);
  });
}

function closeOtherOverlays() {
  ctx.layoutUI?.setViewLayoutOpen?.(false);
  ctx.layoutUI?.setSidebarOpen?.(false);
  ctx.authUI?.setUserMenuOpen?.(false);
  ctx.shareUI?.setShareOpen?.(false);
  ctx.closeAssetsPanel?.();
  ctx.closeConsoleLogPanel?.();
  ctx.closeLoginDialog?.();
  closeAiDialog();
}

export function setSettingsOpen(open) {
  settingsOpen = open;
  if (settingsPanelBackdrop) settingsPanelBackdrop.hidden = !open;
  if (btnSettings) {
    btnSettings.classList.toggle('active', open);
    btnSettings.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (open) {
    closeOtherOverlays();
    updateSaveHelpContentFn();
    updateSettingsAccount();
    document.addEventListener('keydown', onSettingsPanelKeydown);
    settingsPanelClose?.focus();
  } else {
    document.removeEventListener('keydown', onSettingsPanelKeydown);
  }
}

export function closeSettingsPanel() {
  setSettingsOpen(false);
}

export function openSettingsPanel() {
  setSettingsOpen(true);
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

  settingsNavItems.forEach((item) => {
    item.addEventListener('click', () => {
      setActiveSettingsPane(item.dataset.settingsPane);
    });
  });

  settingsPanelClose?.addEventListener('click', () => setSettingsOpen(false));
  settingsPanelDone?.addEventListener('click', () => setSettingsOpen(false));

  settingsPanelBackdrop?.addEventListener('click', (event) => {
    if (event.target === settingsPanelBackdrop) setSettingsOpen(false);
  });

  settingsPanel?.addEventListener('click', (event) => event.stopPropagation());

  return {
    setSettingsOpen,
    closeSettingsPanel,
    openSettingsPanel,
    toggleSettings,
    updateSettingsAccount,
  };
}
