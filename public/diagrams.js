import {
  ctx,
  diagramKey,
  EXAMPLE_FOLDER,
  EXAMPLE_ID,
  folderLabel,
  ID_PATTERN,
  NEW_DIAGRAM_TEMPLATE,
} from './app-context.js';
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
let setQueryDiagramFn = () => {};
let updateSaveHelpContentFn = () => {};
let suppressAutoSave = false;
let contentDirty = false;
let saveInFlight = false;
let contextMenuTargetId = null;
let contextMenuTargetFolder = '';
const syncRefs = new Map();

function buildShareUrl(folder, id) {
  const origin = window.location.origin;
  const user = ctx.user?.username;
  if (!user || !id) return '';
  if (folder) {
    return `${origin}/view/${encodeURIComponent(user)}/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
  }
  return `${origin}/view/${encodeURIComponent(user)}/${encodeURIComponent(id)}`;
}

function loadUrl(folder, id) {
  const params = new URLSearchParams({ id });
  if (folder) params.set('folder', folder);
  return `/api/load?${params}`;
}

function findListItemByKey(folder, id) {
  const key = diagramKey(folder, id);
  for (const li of diagramList.querySelectorAll('.diagram-list-item')) {
    if (diagramKey(li.dataset.diagramFolder || '', li.dataset.diagramId) === key) {
      return li;
    }
  }
  return null;
}

function setListSyncBadge(folder, id, visible) {
  const li = findListItemByKey(folder, id);
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
  for (const key of syncRefs.keys()) {
    if (key.startsWith('__')) continue;
    const slash = key.indexOf('/');
    const folder = slash === -1 ? '' : key.slice(0, slash);
    const id = slash === -1 ? key : key.slice(slash + 1);
    setListSyncBadge(folder, id, true);
  }
}

function beginSync(kind, folder, id) {
  const key = id ? diagramKey(folder, id) : `__${kind}`;
  if (id) {
    const refs = syncRefs.get(key) || { save: 0, rename: 0 };
    refs[kind] += 1;
    syncRefs.set(key, refs);
    setListSyncBadge(folder, id, true);
  } else {
    const refs = syncRefs.get(key) || { save: 0, rename: 0 };
    refs[kind] += 1;
    syncRefs.set(key, refs);
  }
  refreshSyncUI();
}

function endSync(kind, folder, id) {
  const key = id ? diagramKey(folder, id) : `__${kind}`;
  const refs = syncRefs.get(key);
  if (!refs) {
    refreshSyncUI();
    return;
  }

  refs[kind] = Math.max(0, refs[kind] - 1);
  if (refs.save === 0 && refs.rename === 0) {
    syncRefs.delete(key);
    if (id) setListSyncBadge(folder, id, false);
  }

  refreshSyncUI();
}

function hideContextMenu() {
  if (!contextMenu) return;
  contextMenu.hidden = true;
  contextMenuTargetId = null;
  contextMenuTargetFolder = '';
}

function showContextMenu(x, y, diagramId, folder = '') {
  if (!contextMenu) return;
  contextMenuTargetId = diagramId;
  contextMenuTargetFolder = folder;
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

async function promptTargetFolder({ title, defaultValue = '' } = {}) {
  const folders = ctx.diagramFolders.filter(Boolean);
  const hint = folders.length ? `\n\n现有文件夹：${folders.join('、')}\n留空表示「未分组」` : '\n\n留空表示「未分组」';
  const value = prompt(title + hint, defaultValue);
  if (value === null) return null;

  const folder = value.trim();
  if (folder && !ID_PATTERN.test(folder)) {
    showStatusFn('文件夹名称格式无效', true);
    return null;
  }
  return { folder };
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
    const targetFolder = contextMenuTargetFolder;
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
      await renameDiagram(targetId, result.id, targetFolder);
    } else if (action === 'duplicate') {
      await duplicateDiagram(targetId, targetFolder);
    } else if (action === 'move') {
      const result = await promptTargetFolder({
        title: '移动到文件夹',
        defaultValue: targetFolder,
      });
      if (!result) return;
      await moveDiagram(targetId, targetFolder, result.folder);
    } else if (action === 'delete') {
      await removeDiagram(targetId, targetFolder);
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

function isCurrentDiagram(folder, id) {
  return ctx.currentId === id && (ctx.currentFolder || '') === (folder || '');
}

function createDiagramListItem(item) {
  const li = document.createElement('li');
  li.className = 'diagram-list-item';
  li.dataset.diagramId = item.id;
  li.dataset.diagramFolder = item.folder || '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'diagram-item-btn';
  btn.innerHTML = `<span class="diagram-item-icon" aria-hidden="true">◇</span><span class="diagram-item-label">${escapeHtmlFn(item.id)}</span>`;
  btn.classList.toggle('active', isCurrentDiagram(item.folder, item.id));
  btn.addEventListener('click', () => loadDiagram(item.id, item.folder || ''));

  li.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, item.id, item.folder || '');
  });

  li.appendChild(btn);
  return li;
}

async function loadDiagramList() {
  if (!ctx.user?.login) return;

  const res = await fetch('/api/list');
  if (!res.ok) {
    showStatusFn('Failed to load diagram list', true);
    return;
  }

  const { diagrams } = await res.json();
  ctx.diagramIds = new Set(diagrams.map((item) => diagramKey(item.folder, item.id)));

  const groups = new Map();
  for (const item of diagrams) {
    const folder = item.folder || '';
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(item);
  }

  const folderOrder = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
  ctx.diagramFolders = folderOrder;

  diagramList.innerHTML = '';

  for (const folder of folderOrder) {
    const section = document.createElement('li');
    section.className = 'diagram-folder';
    section.dataset.folder = folder;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'diagram-folder-btn';
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `<span class="diagram-folder-chevron" aria-hidden="true">▾</span><span class="diagram-folder-label">${escapeHtmlFn(folderLabel(folder))}</span>`;
    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('diagram-folder--collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
    });

    const items = document.createElement('ul');
    items.className = 'diagram-folder-items';

    for (const item of groups.get(folder)) {
      items.appendChild(createDiagramListItem(item));
    }

    section.appendChild(header);
    section.appendChild(items);
    diagramList.appendChild(section);
  }

  restoreSyncBadges();
}

function openDiagramInEditor({ id, folder = '', code, shareUrl, githubUrl }) {
  ctx.currentId = id;
  ctx.currentFolder = folder || '';
  suppressAutoSave = true;
  clearContentDirty();
  ctx.editor.setValue(code);
  suppressAutoSave = false;
  syncLayoutSelectFromCodeFn();
  setQueryDiagramFn(ctx.currentFolder, ctx.currentId);
  ctx.lastShareUrl = shareUrl || buildShareUrl(ctx.currentFolder, ctx.currentId);
  ctx.lastGithubUrl = githubUrl || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder);
  shareUrlEl.textContent = ctx.lastShareUrl;
  shareUrlEl.title = ctx.lastShareUrl;
  scheduleRenderFn();
  updateSaveHelpContentFn();
}

async function diagramExists(id, folder = '') {
  const res = await fetch(loadUrl(folder, id));
  return res.ok;
}

async function loadDiagram(id, folder = '') {
  if (!ctx.user?.login) {
    showStatusFn('Login required to load saved diagrams', true);
    return false;
  }

  await flushAutoSave();

  const res = await fetch(loadUrl(folder, id));
  if (!res.ok) {
    showStatusFn('Failed to load diagram', true);
    return false;
  }

  const data = await res.json();
  openDiagramInEditor(data);
  await loadDiagramList();
  showStatusFn(`Loaded ${data.id}`);
  return true;
}

async function saveDiagramWithId(id, { quiet = false, folder, code } = {}) {
  if (saveInFlight) return;

  const targetFolder = folder !== undefined ? (folder || '') : ctx.currentFolder;
  const targetId = id !== undefined ? id : ctx.currentId;
  const syncKey = targetId ? diagramKey(targetFolder, targetId) : null;

  if (!quiet) btnSave.disabled = true;
  saveInFlight = true;
  beginSync('save', targetFolder, targetId);

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id || undefined,
        folder: targetFolder || undefined,
        code: code !== undefined ? code : ctx.editor.getValue(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Save failed');
    }

    ctx.currentId = data.id;
    ctx.currentFolder = data.folder || '';
    setQueryDiagramFn(ctx.currentFolder, ctx.currentId);
    ctx.lastShareUrl = data.shareUrl || '';
    ctx.lastGithubUrl = data.githubUrl || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder);
    shareUrlEl.textContent = ctx.lastShareUrl;
    shareUrlEl.title = ctx.lastShareUrl;
    clearContentDirty();
    updateSaveHelpContentFn();

    endSync('save', targetFolder, targetId);
    if (quiet) {
      showStatusFn('已保存');
    } else {
      await loadDiagramList();
      showStatusFn(`Saved to GitHub as ${ctx.currentFolder ? `${ctx.currentFolder}/` : ''}${ctx.currentId}`);
    }
  } catch (err) {
    endSync('save', targetFolder, targetId);
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
  setQueryDiagramFn(ctx.currentFolder, null);
  shareUrlEl.textContent = '';

  suppressAutoSave = true;
  clearContentDirty();
  ctx.editor.setValue(NEW_DIAGRAM_TEMPLATE);
  suppressAutoSave = false;
  syncLayoutSelectFromCodeFn();
  scheduleRenderFn();
  diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));

  await saveDiagramWithId(undefined, { folder: ctx.currentFolder });
}

function findListLabel(folder, diagramId) {
  const li = findListItemByKey(folder, diagramId);
  return li?.querySelector('.diagram-item-label') || null;
}

function commitRenameLocally(oldId, newId, folder = '', { shareUrl, githubUrl } = {}) {
  const wasCurrent = isCurrentDiagram(folder, oldId);
  const oldKey = diagramKey(folder, oldId);
  const newKey = diagramKey(folder, newId);

  ctx.diagramIds.delete(oldKey);
  ctx.diagramIds.add(newKey);

  const label = findListLabel(folder, oldId);
  if (label) {
    label.textContent = newId;
    const li = label.closest('.diagram-list-item');
    if (li) li.dataset.diagramId = newId;
  }

  if (wasCurrent) {
    ctx.currentId = newId;
    setQueryDiagramFn(folder, newId);
    ctx.lastShareUrl = shareUrl || buildShareUrl(folder, newId);
    ctx.lastGithubUrl = githubUrl || getGitHubFileUrl(ctx.user.username, newId, folder);
    shareUrlEl.textContent = ctx.lastShareUrl;
    shareUrlEl.title = ctx.lastShareUrl;
    updateSaveHelpContentFn();
  }
}

async function renameDiagram(oldId, newId, folder = '') {
  await flushAutoSave();
  beginSync('rename', folder, oldId);

  try {
    const res = await fetch('/api/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldId, newId, folder: folder || undefined }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Rename failed');
    }

    commitRenameLocally(oldId, newId, folder, {
      shareUrl: data.shareUrl,
      githubUrl: data.githubUrl,
    });
    endSync('rename', folder, oldId);
    showStatusFn(`已重命名为 ${newId}`);
  } catch (err) {
    endSync('rename', folder, oldId);
    showStatusFn(err.message || '重命名失败', true);
  }
}

async function moveDiagram(id, fromFolder = '', toFolder = '') {
  if ((fromFolder || '') === (toFolder || '')) return;

  await flushAutoSave();
  beginSync('rename', fromFolder, id);

  try {
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        fromFolder: fromFolder || undefined,
        toFolder: toFolder || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Move failed');
    }

    const wasCurrent = isCurrentDiagram(fromFolder, id);
    ctx.diagramIds.delete(diagramKey(fromFolder, id));
    ctx.diagramIds.add(diagramKey(toFolder, id));

    if (wasCurrent) {
      ctx.currentFolder = toFolder || '';
      setQueryDiagramFn(ctx.currentFolder, ctx.currentId);
      ctx.lastShareUrl = data.shareUrl || buildShareUrl(ctx.currentFolder, ctx.currentId);
      ctx.lastGithubUrl = data.githubUrl || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder);
      shareUrlEl.textContent = ctx.lastShareUrl;
      shareUrlEl.title = ctx.lastShareUrl;
      updateSaveHelpContentFn();
    }

    endSync('rename', fromFolder, id);
    await loadDiagramList();
    showStatusFn(`已移动到 ${folderLabel(toFolder)}`);
  } catch (err) {
    endSync('rename', fromFolder, id);
    showStatusFn(err.message || '移动失败', true);
  }
}

async function createDiagramFromCode(code, folder = '') {
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      folder: folder || undefined,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Save failed');
  }

  return data;
}

async function duplicateDiagram(id, folder = '') {
  if (!ctx.user?.login) {
    showStatusFn('Login required', true);
    return;
  }

  if (!isCurrentDiagram(folder, id)) {
    await flushAutoSave();
  }

  try {
    let code;
    if (isCurrentDiagram(folder, id)) {
      code = ctx.editor.getValue();
    } else {
      const res = await fetch(loadUrl(folder, id));
      if (!res.ok) {
        showStatusFn('Failed to load diagram', true);
        return;
      }
      const data = await res.json();
      code = data.code;
    }

    const data = await createDiagramFromCode(code, folder);
    await loadDiagram(data.id, data.folder || '');
    showStatusFn(`已复制为 ${data.id}`);
  } catch (err) {
    showStatusFn(err.message || '复制失败', true);
  }
}

async function removeDiagram(id, folder = '') {
  if (!ctx.user?.login) {
    showStatusFn('Login required', true);
    return;
  }

  const displayPath = folder ? `${folder}/${id}` : id;
  if (!confirm(`Delete "${displayPath}"?`)) return;

  try {
    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, folder: folder || undefined }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Delete failed');
    }

    if (isCurrentDiagram(folder, id)) {
      await loadExample();
    } else {
      await loadDiagramList();
    }

    showStatusFn(`Deleted ${displayPath}`);
  } catch (err) {
    showStatusFn(err.message || 'Delete failed', true);
  }
}

async function loadStaticExample() {
  const res = await fetch('/diagrams/example.mmd');
  if (!res.ok) throw new Error('Failed to load example');

  suppressAutoSave = true;
  clearContentDirty();
  ctx.editor.setValue(await res.text());
  suppressAutoSave = false;
  syncLayoutSelectFromCodeFn();
  ctx.currentId = null;
  ctx.currentFolder = '';
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  setQueryDiagramFn('', null);
  shareUrlEl.textContent = '';
  scheduleRenderFn();
  diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));
  updateSaveHelpContentFn();
}

async function loadExample() {
  try {
    await flushAutoSave();

    if (!ctx.user?.login) {
      await loadStaticExample();
      showStatusFn('Example loaded');
      return;
    }

    const folder = EXAMPLE_FOLDER;
    const id = EXAMPLE_ID;

    if (!(await diagramExists(id, folder))) {
      const res = await fetch('/diagrams/example.mmd');
      if (!res.ok) throw new Error('Failed to load example');
      const code = await res.text();
      await saveDiagramWithId(id, { folder, code, quiet: true });
    }

    const loaded = await loadDiagram(id, folder);
    if (loaded) {
      showStatusFn('已打开示例');
    }
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
  setQueryDiagram,
  updateSaveHelpContent,
}) {
  showStatusFn = showStatus;
  clearPersistentStatusFn = clearPersistentStatus;
  escapeHtmlFn = escapeHtml;
  scheduleRenderFn = scheduleRender;
  syncLayoutSelectFromCodeFn = syncLayoutSelectFromCode;
  setQueryDiagramFn = setQueryDiagram;
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
