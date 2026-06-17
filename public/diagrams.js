import { ctx, ID_PATTERN, NEW_DIAGRAM_TEMPLATE } from './app-context.js';
import { getGitHubFileUrl } from './auth-ui.js';
import { promptDiagramName, refreshDiagramIds } from './name-dialog.js';

const shareUrlEl = document.getElementById('share-url');
const diagramList = document.getElementById('diagram-list');
const btnSave = document.getElementById('btn-save');
const contextMenu = document.getElementById('diagram-context-menu');

const AUTO_SAVE_FALLBACK_MS = 1500;

let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;
let scheduleRenderFn = () => {};
let syncLayoutSelectFromCodeFn = () => {};
let setQueryIdFn = () => {};
let updateSaveHelpContentFn = () => {};
let suppressAutoSave = false;
let contentDirty = false;
let autoSaveTimer = null;
let saveInFlight = false;
let contextMenuTargetId = null;

function hideContextMenu() {
  if (!contextMenu) return;
  contextMenu.hidden = true;
  contextMenuTargetId = null;
}

function showContextMenu(x, y, diagramId) {
  if (!contextMenu) return;
  contextMenuTargetId = diagramId;
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

function initContextMenu() {
  if (!contextMenu) return;

  contextMenu.querySelector('[data-action="rename"]')?.addEventListener('mousedown', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const oldId = contextMenuTargetId;
    hideContextMenu();
    if (!oldId) return;

    await refreshDiagramIds();
    const result = await promptDiagramName({
      title: 'Rename diagram',
      defaultValue: oldId,
      excludeId: oldId,
      allowOverwrite: false,
    });
    if (!result) return;

    await renameDiagram(oldId, result.id);
  });

  document.addEventListener('click', (event) => {
    if (contextMenu.hidden) return;
    if (!contextMenu.contains(event.target)) hideContextMenu();
  });

  document.addEventListener('contextmenu', (event) => {
    if (contextMenu.hidden) return;
    if (!contextMenu.contains(event.target)) hideContextMenu();
  });
}

function markContentDirty() {
  if (suppressAutoSave) return;
  contentDirty = true;
}

function clearContentDirty() {
  contentDirty = false;
}

async function flushAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;

  if (contentDirty && ctx.user?.login && ctx.currentId && !suppressAutoSave) {
    await saveIfDirty({ quiet: true });
  }
}

function scheduleAutoSave() {
  if (suppressAutoSave || !ctx.user?.login || !ctx.currentId) return;

  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    saveIfDirty({ quiet: true });
  }, AUTO_SAVE_FALLBACK_MS);
}

function onPreviewRendered() {
  saveIfDirty({ quiet: true });
}

async function saveIfDirty({ quiet = true } = {}) {
  if (!contentDirty || !ctx.user?.login || !ctx.currentId || suppressAutoSave || saveInFlight) {
    return;
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  await saveDiagramWithId(ctx.currentId, { quiet });
}

async function loadDiagramList() {
  if (!ctx.user?.login) return;

  const res = await fetch('/api/list');
  if (!res.ok) {
    showStatusFn('Failed to load diagram list', true);
    return;
  }

  const { diagrams } = await res.json();
  ctx.diagramIds = new Set(diagrams.map((item) => item.id));
  diagramList.innerHTML = '';

  for (const item of diagrams) {
    const li = document.createElement('li');
    li.className = 'diagram-list-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diagram-item-btn';
    btn.innerHTML = `<span class="diagram-item-icon" aria-hidden="true">◇</span><span class="diagram-item-label">${escapeHtmlFn(item.id)}</span>`;
    btn.classList.toggle('active', item.id === ctx.currentId);
    btn.addEventListener('click', () => loadDiagram(item.id));

    li.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showContextMenu(event.clientX, event.clientY, item.id);
    });

    li.appendChild(btn);
    diagramList.appendChild(li);
  }
}

async function loadDiagram(id) {
  if (!ctx.user?.login) {
    showStatusFn('Login required to load saved diagrams', true);
    return;
  }

  await flushAutoSave();

  const res = await fetch(`/api/load?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    showStatusFn('Failed to load diagram', true);
    return;
  }

  const data = await res.json();
  ctx.currentId = data.id;
  suppressAutoSave = true;
  clearContentDirty();
  ctx.editor.setValue(data.code);
  suppressAutoSave = false;
  syncLayoutSelectFromCodeFn();
  setQueryIdFn(ctx.currentId);
  ctx.lastShareUrl = `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(ctx.currentId)}`;
  ctx.lastGithubUrl = getGitHubFileUrl(ctx.user.username, ctx.currentId);
  scheduleRenderFn();
  await loadDiagramList();
  updateSaveHelpContentFn();
  showStatusFn(`Loaded ${ctx.currentId}`);
}

async function saveDiagramWithId(id, { quiet = false } = {}) {
  if (saveInFlight) return;

  if (!quiet) btnSave.disabled = true;
  saveInFlight = true;

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id || undefined,
        code: ctx.editor.getValue(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Save failed');
    }

    ctx.currentId = data.id;
    setQueryIdFn(ctx.currentId);
    ctx.lastShareUrl = data.shareUrl || '';
    ctx.lastGithubUrl = data.githubUrl || getGitHubFileUrl(ctx.user.username, ctx.currentId);
    shareUrlEl.textContent = ctx.lastShareUrl;
    shareUrlEl.title = ctx.lastShareUrl;
    clearContentDirty();
    updateSaveHelpContentFn();

    if (quiet) {
      showStatusFn('Saved');
    } else {
      await loadDiagramList();
      showStatusFn(`Saved to GitHub as ${ctx.currentId}`);
    }
  } catch (err) {
    showStatusFn(err.message || 'Save failed', true);
  } finally {
    saveInFlight = false;
    if (!quiet) btnSave.disabled = false;
  }
}

async function saveDiagram() {
  if (!ctx.user?.login) {
    showStatusFn('Login with GitHub to save', true);
    return;
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  contentDirty = true;
  await saveDiagramWithId(ctx.currentId || undefined);
}

async function newDiagram() {
  if (!ctx.user?.login) {
    showStatusFn('Login with GitHub to create diagrams', true);
    return;
  }

  await flushAutoSave();

  ctx.currentId = null;
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  setQueryIdFn(null);
  shareUrlEl.textContent = '';

  suppressAutoSave = true;
  clearContentDirty();
  ctx.editor.setValue(NEW_DIAGRAM_TEMPLATE);
  suppressAutoSave = false;
  syncLayoutSelectFromCodeFn();
  scheduleRenderFn();
  diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));

  await saveDiagramWithId(undefined);
}

async function renameDiagram(oldId, newId) {
  if (oldId === newId) {
    showStatusFn('No change', true);
    return;
  }

  if (!ID_PATTERN.test(newId)) {
    showStatusFn('Invalid id format', true);
    return;
  }

  try {
    const res = await fetch('/api/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldId, newId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Rename failed');
    }

    if (oldId === ctx.currentId) {
      ctx.currentId = newId;
      setQueryIdFn(newId);
      ctx.lastShareUrl = data.shareUrl || '';
      ctx.lastGithubUrl = data.githubUrl || getGitHubFileUrl(ctx.user.username, newId);
      shareUrlEl.textContent = ctx.lastShareUrl;
      shareUrlEl.title = ctx.lastShareUrl;
      updateSaveHelpContentFn();
    }

    await loadDiagramList();
    showStatusFn(`Renamed to ${newId}. Old share links no longer work.`);
  } catch (err) {
    showStatusFn(err.message || 'Rename failed', true);
  }
}

async function loadExample() {
  try {
    await flushAutoSave();

    const res = await fetch('/diagrams/example.mmd');
    if (!res.ok) throw new Error('Failed to load example');

    suppressAutoSave = true;
    clearContentDirty();
    ctx.editor.setValue(await res.text());
    suppressAutoSave = false;
    syncLayoutSelectFromCodeFn();
    ctx.currentId = null;
    ctx.lastShareUrl = '';
    ctx.lastGithubUrl = '';
    setQueryIdFn(null);
    shareUrlEl.textContent = '';
    scheduleRenderFn();
    updateSaveHelpContentFn();
    showStatusFn('Example loaded');
  } catch (err) {
    showStatusFn(err.message || 'Failed to load example', true);
  }
}

async function copySource() {
  try {
    await navigator.clipboard.writeText(ctx.editor.getValue());
    showStatusFn('Source copied');
  } catch {
    showStatusFn('Copy failed', true);
  }
}

export function initDiagrams({
  showStatus,
  escapeHtml,
  scheduleRender,
  syncLayoutSelectFromCode,
  setQueryId,
  updateSaveHelpContent,
}) {
  showStatusFn = showStatus;
  escapeHtmlFn = escapeHtml;
  scheduleRenderFn = scheduleRender;
  syncLayoutSelectFromCodeFn = syncLayoutSelectFromCode;
  setQueryIdFn = setQueryId;
  updateSaveHelpContentFn = updateSaveHelpContent;

  initContextMenu();

  return {
    saveDiagram,
    loadExample,
    copySource,
    newDiagram,
    loadDiagram,
    loadDiagramList,
    scheduleAutoSave,
    markContentDirty,
    onPreviewRendered,
  };
}
