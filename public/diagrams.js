import { ctx, ID_PATTERN, NEW_DIAGRAM_TEMPLATE } from './app-context.js';
import { getGitHubFileUrl } from './auth-ui.js';
import { promptDiagramName } from './name-dialog.js';

const shareUrlEl = document.getElementById('share-url');
const diagramList = document.getElementById('diagram-list');
const btnSave = document.getElementById('btn-save');
const contextMenu = document.getElementById('diagram-context-menu');

let showStatusFn = () => {};
let clearPersistentStatusFn = () => {};
let escapeHtmlFn = (str) => str;
let scheduleRenderFn = () => {};
let syncLayoutSelectFromCodeFn = () => {};
let setQueryIdFn = () => {};
let updateSaveHelpContentFn = () => {};
let suppressAutoSave = false;
let contentDirty = false;
let saveInFlight = false;
let contextMenuTargetId = null;
const syncRefs = new Map();

function findListItemById(diagramId) {
  if (!diagramId) return null;
  for (const li of diagramList.querySelectorAll('.diagram-list-item')) {
    if (li.dataset.diagramId === diagramId) return li;
  }
  return null;
}

function setListSyncBadge(diagramId, visible) {
  const li = findListItemById(diagramId);
  if (!li) return;

  li.classList.toggle('diagram-list-item--syncing', visible);
  let badge = li.querySelector('.diagram-sync-badge');
  if (visible) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'diagram-sync-badge';
      badge.textContent = '同步中';
      li.appendChild(badge);
    }
  } else {
    badge?.remove();
  }
}

function getSyncTotals() {
  let save = 0;
  let rename = 0;
  for (const refs of syncRefs.values()) {
    save += refs.save;
    rename += refs.rename;
  }
  return { save, rename };
}

function refreshSyncUI() {
  const { save, rename } = getSyncTotals();
  if (save === 0 && rename === 0) {
    clearPersistentStatusFn();
    return;
  }

  let message = '正在保存…';
  if (save > 0 && rename > 0) message = '正在保存并同步…';
  else if (rename > 0) message = '正在同步到 GitHub…';

  showStatusFn(message, { persistent: true });
}

function restoreSyncBadges() {
  for (const diagramId of syncRefs.keys()) {
    if (diagramId.startsWith('__')) continue;
    setListSyncBadge(diagramId, true);
  }
}

function beginSync(kind, diagramId) {
  if (diagramId) {
    const refs = syncRefs.get(diagramId) || { save: 0, rename: 0 };
    refs[kind] += 1;
    syncRefs.set(diagramId, refs);
    setListSyncBadge(diagramId, true);
  } else {
    const key = `__${kind}`;
    const refs = syncRefs.get(key) || { save: 0, rename: 0 };
    refs[kind] += 1;
    syncRefs.set(key, refs);
  }
  refreshSyncUI();
}

function endSync(kind, diagramId) {
  const key = diagramId || `__${kind}`;
  const refs = syncRefs.get(key);
  if (!refs) {
    refreshSyncUI();
    return;
  }

  refs[kind] = Math.max(0, refs[kind] - 1);
  if (refs.save === 0 && refs.rename === 0) {
    syncRefs.delete(key);
    if (diagramId) setListSyncBadge(diagramId, false);
  }

  refreshSyncUI();
}

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
      await renameDiagram(targetId, result.id);
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
  if (contentDirty && ctx.user?.login && ctx.currentId && !suppressAutoSave) {
    await saveIfDirty({ quiet: true });
  }
}

function scheduleAutoSave() {
  if (suppressAutoSave || !ctx.user?.login || !ctx.currentId) return;
  saveIfDirty({ quiet: true });
}

function onPreviewRendered() {
  saveIfDirty({ quiet: true });
}

async function saveIfDirty({ quiet = true } = {}) {
  if (!contentDirty || !ctx.user?.login || !ctx.currentId || suppressAutoSave || saveInFlight) {
    return;
  }

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

  restoreSyncBadges();
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

  const syncDiagramId = ctx.currentId || id || null;

  if (!quiet) btnSave.disabled = true;
  saveInFlight = true;
  beginSync('save', syncDiagramId);

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

    endSync('save', syncDiagramId);
    if (quiet) {
      showStatusFn('已保存');
    } else {
      await loadDiagramList();
      showStatusFn(`Saved to GitHub as ${ctx.currentId}`);
    }
  } catch (err) {
    endSync('save', syncDiagramId);
    showStatusFn(err.message || 'Save failed', true);
  } finally {
    saveInFlight = false;
    if (!quiet) btnSave.disabled = false;
    if (contentDirty && quiet) {
      saveIfDirty({ quiet: true });
    }
  }
}

async function saveDiagram() {
  if (!ctx.user?.login) {
    showStatusFn('Login with GitHub to save', true);
    return;
  }

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

function commitRenameLocally(oldId, newId, { shareUrl, githubUrl } = {}) {
  const wasCurrent = oldId === ctx.currentId;

  ctx.diagramIds.delete(oldId);
  ctx.diagramIds.add(newId);

  const label = findListLabel(oldId);
  if (label) {
    label.textContent = newId;
    const li = label.closest('.diagram-list-item');
    if (li) li.dataset.diagramId = newId;
  }

  if (wasCurrent) {
    ctx.currentId = newId;
    setQueryIdFn(newId);
    ctx.lastShareUrl = shareUrl || `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(newId)}`;
    ctx.lastGithubUrl = githubUrl || getGitHubFileUrl(ctx.user.username, newId);
    shareUrlEl.textContent = ctx.lastShareUrl;
    shareUrlEl.title = ctx.lastShareUrl;
    updateSaveHelpContentFn();
  }
}

async function renameDiagram(oldId, newId) {
  await flushAutoSave();
  beginSync('rename', oldId);

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

    commitRenameLocally(oldId, newId, {
      shareUrl: data.shareUrl,
      githubUrl: data.githubUrl,
    });
    endSync('rename', oldId);
    showStatusFn(`已重命名为 ${newId}`);
  } catch (err) {
    endSync('rename', oldId);
    showStatusFn(err.message || '重命名失败', true);
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
  clearPersistentStatus,
  escapeHtml,
  scheduleRender,
  syncLayoutSelectFromCode,
  setQueryId,
  updateSaveHelpContent,
}) {
  showStatusFn = showStatus;
  clearPersistentStatusFn = clearPersistentStatus;
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
