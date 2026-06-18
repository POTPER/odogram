import { ctx } from './app-context.js';
import {
  formatLogLine,
  getStatusLogEntries,
  setStatusLogChangeListener,
} from './status-log.js';

const btnStatusConsole = document.getElementById('btn-status-console');
const consoleLogBackdrop = document.getElementById('console-log-backdrop');
const consoleLogPanel = document.getElementById('console-log-panel');
const consoleLogClose = document.getElementById('console-log-close');
const consoleLogList = document.getElementById('console-log-list');

function onConsoleLogKeydown(event) {
  if (consoleLogBackdrop?.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeConsoleLogPanel();
  }
}

function renderConsoleLogList() {
  if (!consoleLogList) return;

  const entries = getStatusLogEntries();
  consoleLogList.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'console-log-empty';
    empty.textContent = '暂无日志';
    consoleLogList.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'console-log-item';
    if (entry.isError) li.classList.add('error');
    li.textContent = formatLogLine(entry);
    consoleLogList.appendChild(li);
  }

  consoleLogList.scrollTop = consoleLogList.scrollHeight;
}

function closeOtherOverlays() {
  ctx.layoutUI?.setViewLayoutOpen?.(false);
  ctx.layoutUI?.setSidebarOpen?.(false);
  ctx.settingsUI?.setSettingsOpen?.(false);
  ctx.shareUI?.setShareOpen?.(false);
  ctx.authUI?.setUserMenuOpen?.(false);
  ctx.closeAssetsPanel?.();
  ctx.closeLoginDialog?.();
  ctx.closeAiDialog?.();
}

export function openConsoleLogPanel() {
  if (!consoleLogBackdrop) return;

  closeOtherOverlays();
  renderConsoleLogList();
  consoleLogBackdrop.hidden = false;
  document.addEventListener('keydown', onConsoleLogKeydown);
  consoleLogClose?.focus();
}

export function closeConsoleLogPanel() {
  if (!consoleLogBackdrop) return;
  consoleLogBackdrop.hidden = true;
  document.removeEventListener('keydown', onConsoleLogKeydown);
}

export function initConsoleLogPanel() {
  setStatusLogChangeListener(() => {
    if (consoleLogBackdrop && !consoleLogBackdrop.hidden) {
      renderConsoleLogList();
    }
  });

  btnStatusConsole?.addEventListener('click', (event) => {
    event.stopPropagation();
    openConsoleLogPanel();
  });

  consoleLogClose?.addEventListener('click', () => closeConsoleLogPanel());

  consoleLogBackdrop?.addEventListener('click', (event) => {
    if (event.target === consoleLogBackdrop) closeConsoleLogPanel();
  });

  consoleLogPanel?.addEventListener('click', (event) => event.stopPropagation());
}
