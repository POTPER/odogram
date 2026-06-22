import { GUEST_EXAMPLES } from './guest-catalog.js';
import { ctx, diagramKey, folderLabel, ID_PATTERN } from '../app-context.js';
import { promptDiagramName } from '../name-dialog.js';
import { promptFolder } from '../folder-dialog.js';
import { editDiagramTags } from '../tags-dialog.js';
import { newDiagramInFolder, renameFolder } from './folders.js';
import { api, dom, state, ui } from './registry.js';
import { findListItemByKey } from './utils.js';

function setListSyncBadge(folder, id, visible) {
  const li = findListItemByKey(dom.diagramList, folder, id);
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

export function setListItemLoading(folder, id, visible) {
  const li = findListItemByKey(dom.diagramList, folder, id);
  if (!li) return;
  li.classList.toggle('diagram-list-item--loading', visible);
}

function getSyncTotals() {
  let save = 0;
  let rename = 0;
  for (const refs of state.syncRefs.values()) {
    save += refs.save;
    rename += refs.rename;
  }
  return { save, rename };
}

function refreshSyncUI() {
  const { save, rename } = getSyncTotals();
  if (save === 0 && rename === 0) {
    ui.clearPersistentStatus();
    return;
  }

  let message = '正在保存…';
  if (save > 0 && rename > 0) message = '正在保存并同步…';
  else if (rename > 0) message = '正在同步到 GitHub…';

  ui.showStatus(message, { persistent: true });
}

export function restoreSyncBadges() {
  for (const key of state.syncRefs.keys()) {
    if (key.startsWith('__')) continue;
    const slash = key.indexOf('/');
    const folder = slash === -1 ? '' : key.slice(0, slash);
    const id = slash === -1 ? key : key.slice(slash + 1);
    setListSyncBadge(folder, id, true);
  }
}

export function beginSync(kind, folder, id) {
  const key = id ? diagramKey(folder, id) : `__${kind}`;
  if (id) {
    const refs = state.syncRefs.get(key) || { save: 0, rename: 0 };
    refs[kind] += 1;
    state.syncRefs.set(key, refs);
    setListSyncBadge(folder, id, true);
  } else {
    const refs = state.syncRefs.get(key) || { save: 0, rename: 0 };
    refs[kind] += 1;
    state.syncRefs.set(key, refs);
  }
  refreshSyncUI();
}

export function endSync(kind, folder, id) {
  const key = id ? diagramKey(folder, id) : `__${kind}`;
  const refs = state.syncRefs.get(key);
  if (!refs) {
    refreshSyncUI();
    return;
  }

  refs[kind] = Math.max(0, refs[kind] - 1);
  if (refs.save === 0 && refs.rename === 0) {
    state.syncRefs.delete(key);
    if (id) setListSyncBadge(folder, id, false);
  }

  refreshSyncUI();
}

function hideContextMenu() {
  if (!dom.contextMenu) return;
  dom.contextMenu.hidden = true;
  state.contextMenuTargetId = null;
  state.contextMenuTargetFolder = '';
}

function hideFolderContextMenu() {
  if (!dom.folderContextMenu) return;
  dom.folderContextMenu.hidden = true;
  state.folderContextMenuTarget = '';
}

function showContextMenu(x, y, diagramId, folder = '') {
  hideFolderContextMenu();
  if (!dom.contextMenu) return;
  state.contextMenuTargetId = diagramId;
  state.contextMenuTargetFolder = folder;
  dom.contextMenu.hidden = false;
  dom.contextMenu.style.left = `${x}px`;
  dom.contextMenu.style.top = `${y}px`;
}

function showFolderContextMenu(x, y, folder = '') {
  hideContextMenu();
  if (!dom.folderContextMenu) return;
  state.folderContextMenuTarget = folder;
  dom.folderContextMenu.hidden = false;
  dom.folderContextMenu.style.left = `${x}px`;
  dom.folderContextMenu.style.top = `${y}px`;

  dom.folderContextMenu.querySelector('[data-action="rename-folder"]')?.toggleAttribute(
    'hidden',
    !folder,
  );
}

function collectAllTags(diagrams) {
  const tags = new Set();
  for (const item of diagrams) {
    for (const tag of item.tags || []) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function diagramMatchesTagFilter(item, tagFilter) {
  if (!tagFilter) return true;
  return (item.tags || []).includes(tagFilter);
}

function renderTagFilterBar(diagrams) {
  if (!dom.tagFilterBar) return;

  const tags = collectAllTags(diagrams);
  dom.tagFilterBar.replaceChildren();

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'tag-filter-chip';
  allBtn.textContent = '全部';
  allBtn.classList.toggle('active', !state.activeTagFilter);
  allBtn.addEventListener('click', () => {
    state.activeTagFilter = '';
    renderDiagramTree(state.lastDiagrams);
  });
  dom.tagFilterBar.appendChild(allBtn);

  for (const tag of tags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-filter-chip';
    btn.textContent = tag;
    btn.classList.toggle('active', state.activeTagFilter === tag);
    btn.addEventListener('click', () => {
      state.activeTagFilter = tag;
      renderDiagramTree(state.lastDiagrams);
    });
    dom.tagFilterBar.appendChild(btn);
  }

  dom.tagFilterBar.hidden = tags.length === 0;
}

function renderTagChips(tags) {
  if (!tags?.length) return '';
  return `<span class="diagram-item-tags">${tags.map((tag) => `<span class="diagram-tag-chip">${ui.escapeHtml(tag)}</span>`).join('')}</span>`;
}

function createGuestDiagramListItem(item) {
  const li = document.createElement('li');
  li.className = 'diagram-list-item';
  li.dataset.diagramId = item.id;
  li.dataset.diagramFolder = item.folder || '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'diagram-item-btn';
  btn.innerHTML = `<span class="diagram-item-icon" aria-hidden="true">◇</span><span class="diagram-item-label">${ui.escapeHtml(item.label)}</span>`;
  btn.classList.toggle('active', api.isCurrentDiagram(item.folder, item.id));
  btn.addEventListener('click', () => api.loadGuestExample(item));

  li.appendChild(btn);
  return li;
}

function createDiagramListItem(item) {
  const li = document.createElement('li');
  li.className = 'diagram-list-item';
  li.dataset.diagramId = item.id;
  li.dataset.diagramFolder = item.folder || '';
  if (state.activeTagFilter && !diagramMatchesTagFilter(item, state.activeTagFilter)) {
    li.hidden = true;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'diagram-item-btn';
  const tagsHtml = renderTagChips(item.tags);
  btn.innerHTML = `<span class="diagram-item-icon" aria-hidden="true">◇</span><span class="diagram-item-main"><span class="diagram-item-label">${ui.escapeHtml(item.id)}</span>${tagsHtml}</span>`;
  btn.classList.toggle('active', api.isCurrentDiagram(item.folder, item.id));
  btn.addEventListener('click', () => api.loadDiagram(item.id, item.folder || ''));

  li.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, item.id, item.folder || '');
  });

  li.appendChild(btn);
  return li;
}

function createFolderSection(folder, items) {
  const visibleItems = items.filter((item) => diagramMatchesTagFilter(item, state.activeTagFilter));
  if (visibleItems.length === 0) return null;

  const section = document.createElement('li');
  section.className = 'diagram-folder';
  section.dataset.folder = folder;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'diagram-folder-btn';
  header.setAttribute('aria-expanded', 'true');
  header.innerHTML = `<span class="diagram-folder-chevron" aria-hidden="true">▾</span><span class="diagram-folder-label">${ui.escapeHtml(folderLabel(folder))}</span>`;
  header.addEventListener('click', () => {
    const collapsed = section.classList.toggle('diagram-folder--collapsed');
    header.setAttribute('aria-expanded', String(!collapsed));
  });
  header.addEventListener('contextmenu', (event) => {
    if (ctx.user?.login) {
      event.preventDefault();
      event.stopPropagation();
      showFolderContextMenu(event.clientX, event.clientY, folder);
    }
  });

  const itemsEl = document.createElement('ul');
  itemsEl.className = 'diagram-folder-items';

  for (const item of visibleItems) {
    itemsEl.appendChild(createDiagramListItem(item));
  }

  section.appendChild(header);
  section.appendChild(itemsEl);
  return section;
}

function renderDiagramTree(diagrams) {
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

  dom.diagramList.innerHTML = '';

  for (const folder of folderOrder) {
    const section = createFolderSection(folder, groups.get(folder));
    if (section) dom.diagramList.appendChild(section);
  }

  renderTagFilterBar(diagrams);
  restoreSyncBadges();
}

export function loadGuestExampleList() {
  if (ctx.user?.login) return;

  const groups = new Map();
  for (const item of GUEST_EXAMPLES) {
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

  dom.diagramList.innerHTML = '';
  if (dom.tagFilterBar) dom.tagFilterBar.hidden = true;

  for (const folder of folderOrder) {
    const section = document.createElement('li');
    section.className = 'diagram-folder';
    section.dataset.folder = folder;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'diagram-folder-btn';
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `<span class="diagram-folder-chevron" aria-hidden="true">▾</span><span class="diagram-folder-label">${ui.escapeHtml(folderLabel(folder))}</span>`;
    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('diagram-folder--collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
    });

    const items = document.createElement('ul');
    items.className = 'diagram-folder-items';

    for (const item of groups.get(folder)) {
      items.appendChild(createGuestDiagramListItem(item));
    }

    section.appendChild(header);
    section.appendChild(items);
    dom.diagramList.appendChild(section);
  }
}

export async function loadDiagramList() {
  if (!ctx.user?.login) return;

  const res = await fetch('/api/list');
  if (!res.ok) {
    ui.showStatus('Failed to load diagram list', true);
    return;
  }

  const { diagrams } = await res.json();
  ctx.diagramIds = new Set(diagrams.map((item) => diagramKey(item.folder, item.id)));
  state.lastDiagrams = diagrams;
  renderDiagramTree(diagrams);
}

export function updateListActiveState() {
  dom.diagramList.querySelectorAll('.diagram-list-item').forEach((li) => {
    const btn = li.querySelector('.diagram-item-btn');
    if (!btn) return;
    btn.classList.toggle(
      'active',
      api.isCurrentDiagram(li.dataset.diagramFolder || '', li.dataset.diagramId),
    );
  });
}

export function initSidebarActions() {
  dom.btnNewFolder?.addEventListener('click', async () => {
    const result = await promptFolder({
      mode: 'create',
      title: '新建文件夹',
      defaultValue: '',
    });
    if (!result?.folder) return;
    await newDiagramInFolder(result.folder);
    await loadDiagramList();
  });
}

function initFolderContextMenu() {
  if (!dom.folderContextMenu) return;

  dom.folderContextMenu.addEventListener('mousedown', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    const action = btn.dataset.action;
    const targetFolder = state.folderContextMenuTarget;
    hideFolderContextMenu();

    if (action === 'new-in-folder') {
      await newDiagramInFolder(targetFolder);
      await loadDiagramList();
    } else if (action === 'rename-folder' && targetFolder) {
      const result = await promptFolder({
        mode: 'rename',
        title: '重命名文件夹',
        defaultValue: targetFolder,
        excludeFolder: targetFolder,
      });
      if (!result?.folder || result.folder === targetFolder) return;
      try {
        await renameFolder(targetFolder, result.folder);
      } catch (err) {
        ui.showStatus(err.message || '重命名文件夹失败', true);
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (dom.folderContextMenu?.hidden) return;
    if (!dom.folderContextMenu.contains(event.target)) hideFolderContextMenu();
  });

  document.addEventListener('contextmenu', (event) => {
    if (dom.folderContextMenu?.hidden) return;
    if (!dom.folderContextMenu.contains(event.target)) hideFolderContextMenu();
  });
}

export function initContextMenu() {
  initFolderContextMenu();
  initSidebarActions();

  if (!dom.contextMenu) return;

  dom.contextMenu.addEventListener('mousedown', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    const action = btn.dataset.action;
    const targetId = state.contextMenuTargetId;
    const targetFolder = state.contextMenuTargetFolder;
    hideContextMenu();
    if (!targetId && action !== 'edit-tags') return;

    if (action === 'rename') {
      const result = await promptDiagramName({
        title: '重命名',
        defaultValue: targetId,
        excludeId: targetId,
        allowOverwrite: false,
      });
      if (!result || result.id === targetId) return;
      if (!ID_PATTERN.test(result.id)) {
        ui.showStatus('名称格式无效', true);
        return;
      }
      await api.renameDiagram(targetId, result.id, targetFolder);
    } else if (action === 'duplicate') {
      await api.duplicateDiagram(targetId, targetFolder);
    } else if (action === 'move') {
      const result = await promptFolder({
        mode: 'move',
        title: '移动到文件夹',
        defaultValue: targetFolder,
      });
      if (!result) return;
      await api.moveDiagram(targetId, targetFolder, result.folder);
    } else if (action === 'edit-tags') {
      const isCurrent = api.isCurrentDiagram(targetFolder, targetId);
      const item = state.lastDiagrams.find(
        (d) => d.id === targetId && (d.folder || '') === (targetFolder || ''),
      );
      try {
        await editDiagramTags({
          folder: targetFolder,
          id: targetId,
          tags: item?.tags || [],
          isCurrent,
        });
        await loadDiagramList();
        ui.showStatus('标签已更新');
      } catch (err) {
        ui.showStatus(err.message || '更新标签失败', true);
      }
    } else if (action === 'delete') {
      await api.removeDiagram(targetId, targetFolder);
    }
  });

  document.addEventListener('click', (event) => {
    if (dom.contextMenu.hidden) return;
    if (!dom.contextMenu.contains(event.target)) hideContextMenu();
  });

  document.addEventListener('contextmenu', (event) => {
    if (dom.contextMenu.hidden) return;
    if (!dom.contextMenu.contains(event.target)) hideContextMenu();
  });
}
