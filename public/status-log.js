import { ctx, diagramKey } from './app-context.js';

const STORAGE_PREFIX = 'odogram:status-log:';
const MAX_ENTRIES = 200;
const SAVE_DEBOUNCE_MS = 300;

const statusEl = document.getElementById('status-message');

let entries = [];
let currentScope = null;
let saveTimer = null;
let onLogChange = null;

export function setStatusLogChangeListener(fn) {
  onLogChange = fn;
}

export function getStatusLogScope() {
  if (ctx.currentGuestExampleId) {
    return `guest:${ctx.currentGuestExampleId}`;
  }
  if (ctx.user?.login) {
    if (ctx.currentId) {
      const key = diagramKey(ctx.currentFolder, ctx.currentId);
      return `${ctx.user.username}/${key}`;
    }
    return `${ctx.user.username}/__draft__`;
  }
  return 'guest:__welcome__';
}

export function formatStatusTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return formatStatusTimestamp(new Date());
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}年${m}月${day}日${h}:${min}:${s}`;
}

export function formatLogLine(entry) {
  return `${formatStatusTimestamp(entry.timestamp)} ${entry.message}`;
}

function loadLogForScope(scope) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) entries = [];
  } catch {
    entries = [];
  }
}

function saveLogToStorage(scope = currentScope) {
  if (!scope) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(entries));
  } catch {
    // quota or private mode
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLogToStorage(), SAVE_DEBOUNCE_MS);
}

export function switchStatusLogScope(scope = getStatusLogScope()) {
  if (currentScope && currentScope !== scope) {
    clearTimeout(saveTimer);
    saveLogToStorage(currentScope);
  }
  currentScope = scope;
  loadLogForScope(scope);
  renderLatest();
  onLogChange?.();
}

export function appendStatusLog(message, { isError = false, timestamp } = {}) {
  const ts = timestamp
    ? new Date(timestamp).toISOString()
    : new Date().toISOString();

  entries.push({ message, timestamp: ts, isError: !!isError });
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  scheduleSave();
  renderLatest();
  onLogChange?.();
}

export function renderLatest() {
  if (!statusEl) return;

  const last = entries[entries.length - 1];
  if (last) {
    statusEl.textContent = formatLogLine(last);
    statusEl.classList.toggle('error', last.isError);
  } else {
    statusEl.textContent = '';
    statusEl.classList.remove('error');
  }
}

export function clearStatusBarTransient() {
  if (!statusEl) return;
  statusEl.classList.remove('syncing');
  renderLatest();
}

export function getStatusLogEntries() {
  return [...entries];
}

export function initStatusLog() {
  switchStatusLogScope(getStatusLogScope());
}
