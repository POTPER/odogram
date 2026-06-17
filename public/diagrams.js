import { ctx, ID_PATTERN, NEW_DIAGRAM_TEMPLATE } from './app-context.js';
import { getGitHubFileUrl } from './auth-ui.js';
import { promptDiagramName } from './name-dialog.js';

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
const renameInFlight = new Set();

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

function cancelPendingAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
}

function initContextMenu() {
  if (!contextMenu) return;

  contextMenu.addEventListener('mousedown', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    const action = btn.dataset.action;
    const targetId = contextMenuTargetId;
    hideContextMenu();
    if (!targetId) return;

    if (action === 'rename') {
      const result = await promptDiagramName({
        title: '重命名',
        defaultValue: targetId,
        excludeId: targetId,
        allowOverwrite: false,
      });
      if (!result || result.id === targetId) return;
      if (!ID_PATTERN.test(result.id)) {
        showStatusFn('名称格式无效', true);
        return;
      }
      const rollback = applyRenameLocally(targetId, result.id);
      showStatusFn('正在同步…');
      syncRenameInBackground(targetId, result.id, rollback);
    } else if (action === 'duplicate') {
      await duplicateDiagram(targetId);
    } else if (action === 'delete') {
      await removeDiagram(targetId);
    }
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
    li.dataset.diagramId = item.id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diagram-item-btn';
    btn.innerHTML = `<span class="diagram-item-icon" aria-hidden="true">◇</span><span class="diagram-item-label">${escapeHtmlFn(item.id)}</span>`;
    btn.classList.toggle('active', item.id === ctx.currentId);
    btn.addEventListener('click', () => loadDiagram(item.id));

    li.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showContextMenu(event.clientX, event.clientY, li.dataset.diagramId);
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

function findListLabel(diagramId) {
  for (const label of diagramList.querySelectorAll('.diagram-item-label')) {
    if (label.textContent === diagramId) return label;
  }
  return null;
}

function applyRenameLocally(oldId, newId) {
  const wasCurrent = oldId === ctx.currentId;
  const snapshot = {
    wasCurrent,
    currentId: ctx.currentId,
    lastShareUrl: ctx.lastShareUrl,
    lastGithubUrl: ctx.lastGithubUrl,
    diagramIds: new Set(ctx.diagramIds),
    label: findListLabel(oldId),
    oldLabelText: oldId,
  };

  ctx.diagramIds.delete(oldId);
  ctx.diagramIds.add(newId);

  if (snapshot.label) {
    snapshot.label.textContent = newId;
    const li = snapshot.label.closest('.diagram-list-item');
    if (li) li.dataset.diagramId = newId;
  }

  if (wasCurrent) {
    ctx.currentId = newId;
    setQueryIdFn(newId);
    ctx.lastShareUrl = `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(newId)}`;
    ctx.lastGithubUrl = getGitHubFileUrl(ctx.user.username, newId);
    shareUrlEl.textContent = ctx.lastShareUrl;
    shareUrlEl.title = ctx.lastShareUrl;
    updateSaveHelpContentFn();
  }

  return () => {
    ctx.diagramIds = snapshot.diagramIds;
    if (snapshot.label) {
      snapshot.label.textContent = snapshot.oldLabelText;
      const li = snapshot.label.closest('.diagram-list-item');
      if (li) li.dataset.diagramId = oldId;
    }
    if (snapshot.wasCurrent) {
      ctx.currentId = snapshot.currentId;
      setQueryIdFn(snapshot.currentId);
      ctx.lastShareUrl = snapshot.lastShareUrl;
      ctx.lastGithubUrl = snapshot.lastGithubUrl;
      shareUrlEl.textContent = snapshot.lastShareUrl;
      shareUrlEl.title = snapshot.lastShareUrl;
      updateSaveHelpContentFn();
    }
  };
}

async function syncRenameInBackground(oldId, newId, rollback) {
  if (renameInFlight.has(oldId)) return;
  renameInFlight.add(oldId);

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

    if (newId === ctx.currentId) {
      ctx.lastShareUrl = data.shareUrl || ctx.lastShareUrl;
      ctx.lastGithubUrl = data.githubUrl || getGitHubFileUrl(ctx.user.username, newId);
      shareUrlEl.textContent = ctx.lastShareUrl;
      shareUrlEl.title = ctx.lastShareUrl;
      updateSaveHelpContentFn();
    }

    showStatusFn(`已重命名为 ${newId}`);
  } catch (err) {
    rollback();
    await loadDiagramList();
    showStatusFn(err.message || '重命名失败', true);
  } finally {
    renameInFlight.delete(oldId);
  }
}

async function createDiagramFromCode(code) {
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Save failed');
  }

  return data;
}

async function duplicateDiagram(id) {
  if (!ctx.user?.login) {
    showStatusFn('Login required', true);
    return;
  }

  if (id !== ctx.currentId) {
    await flushAutoSave();
  }

  try {
    let code;
    if (id === ctx.currentId) {
      code = ctx.editor.getValue();
    } else {
      const res = await fetch(`/api/load?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        showStatusFn('Failed to load diagram', true);
        return;
      }
      const data = await res.json();
      code = data.code;
    }

    const data = await createDiagramFromCode(code);
    await loadDiagram(data.id);
    showStatusFn(`已复制为 ${data.id}`);
  } catch (err) {
    showStatusFn(err.message || '复制失败', true);
  }
}

async function removeDiagram(id) {
  if (!ctx.user?.login) {
    showStatusFn('Login required', true);
    return;
  }

  if (!confirm(`Delete "${id}"?`)) return;

  if (id === ctx.currentId) {
    cancelPendingAutoSave();
  }

  try {
    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Delete failed');
    }

    if (id === ctx.currentId) {
      await loadExample();
      await loadDiagramList();
    } else {
      await loadDiagramList();
    }

    showStatusFn(`Deleted ${id}`);
  } catch (err) {
    showStatusFn(err.message || 'Delete failed', true);
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
