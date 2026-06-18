import { ctx } from './app-context.js';
import { closeAiDialog } from './ai-dialog.js';

const btnShare = document.getElementById('btn-share');
const sharePopover = document.getElementById('share-popover');
const shareUrlInput = document.getElementById('share-url-input');
const btnShareCopy = document.getElementById('btn-share-copy');
const btnShareOpen = document.getElementById('btn-share-open');

let shareOpen = false;
let showStatusFn = () => {};

export function setShareOpen(open) {
  shareOpen = open;
  if (sharePopover) sharePopover.hidden = !open;
  if (btnShare) {
    btnShare.classList.toggle('active', open);
    btnShare.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (open) {
    ctx.layoutUI?.setViewLayoutOpen?.(false);
    ctx.settingsUI?.setSettingsOpen?.(false);
    ctx.authUI?.setUserMenuOpen?.(false);
    closeAiDialog();
    shareUrlInput?.select();
  }
}

export function toggleShare(event) {
  event?.stopPropagation();
  if (btnShare?.disabled) return;
  setShareOpen(!shareOpen);
}

export function updateShareUI() {
  const url = ctx.lastShareUrl || '';
  const canShare = !!ctx.user?.login && !!url;

  if (shareUrlInput) shareUrlInput.value = url;
  if (btnShareOpen) {
    btnShareOpen.href = url || '#';
    btnShareOpen.toggleAttribute('aria-disabled', !url);
    if (!url) btnShareOpen.tabIndex = -1;
    else btnShareOpen.removeAttribute('tabindex');
  }

  if (btnShare) {
    btnShare.disabled = !canShare;
    btnShare.title = ctx.user?.login
      ? (url ? '分享' : '保存后可分享')
      : '登录并保存后可分享';
  }

  if (!canShare && shareOpen) setShareOpen(false);
}

export function initShareUI({ showStatus } = {}) {
  showStatusFn = showStatus ?? showStatusFn;

  btnShare?.addEventListener('click', toggleShare);
  sharePopover?.addEventListener('click', (event) => event.stopPropagation());

  btnShareCopy?.addEventListener('click', async () => {
    const url = ctx.lastShareUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showStatusFn('链接已复制');
    } catch {
      showStatusFn('复制失败', true);
    }
  });

  btnShareOpen?.addEventListener('click', (event) => {
    if (!ctx.lastShareUrl) event.preventDefault();
  });

  document.addEventListener('click', () => {
    if (shareOpen) setShareOpen(false);
  });

  updateShareUI();

  return {
    setShareOpen,
    toggleShare,
    updateShareUI,
  };
}
