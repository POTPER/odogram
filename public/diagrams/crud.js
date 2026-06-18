import {
  ctx,
  diagramKey,
  folderLabel,
  ID_PATTERN,
  NEW_DIAGRAM_TEMPLATE,
} from '../app-context.js';
import { getGitHubFileUrl } from '../auth-ui.js';
import {
  clearAutoSaveTimer,
  clearContentDirty,
  flushAutoSave,
  hasUnsavedChanges,
  scheduleAutoSave,
  setSuppressAutoSave,
  syncBaseline,
} from './autosave.js';
import { beginSync, endSync, loadDiagramList, setListItemLoading, updateListActiveState } from './sidebar.js';
import { dom, state, ui, api } from './registry.js';
import { buildShareUrl, isCurrentDiagram, loadUrl, findListItemByKey } from './utils.js';
import {
  beginPreviewLoading,
  endPreviewLoading,
  setPreviewLoadingPhase,
} from '../preview-loading.js';

export function openDiagramInEditor({ id, folder = '', code, shareUrl, githubUrl, number, updatedAt }, { deferRender = false } = {}) {
  ctx.currentId = id;
  ctx.currentFolder = folder || '';
  ctx.currentNumber = number ?? null;
  ctx.currentUpdatedAt = updatedAt ?? null;
  ctx.currentGuestExampleId = null;
  setSuppressAutoSave(true);
  clearAutoSaveTimer();
  clearContentDirty();
  ctx.editor.setValue(code);
  syncBaseline(code);
  setSuppressAutoSave(false);
  ui.syncLayoutSelectFromCode();
  ui.setQueryDiagram(ctx.currentFolder, ctx.currentId);
  ctx.lastShareUrl = shareUrl || buildShareUrl(ctx.currentFolder, ctx.currentId);
  ctx.lastGithubUrl = githubUrl
    || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder, ctx.currentNumber);
  dom.shareUrlEl.textContent = ctx.lastShareUrl;
  dom.shareUrlEl.title = ctx.lastShareUrl;
  if (!deferRender) {
    ui.scheduleRender();
  }
  ui.updateSaveHelpContent();
  updateListActiveState();
}

async function renderOpenedDiagram() {
  setPreviewLoadingPhase('render');
  await ui.renderPreviewNow();
  await ui.waitForPreviewSettled();
}

export async function loadDiagram(id, folder = '') {
  if (!ctx.user?.login) {
    ui.showStatus('Login required to load saved diagrams', true);
    return false;
  }

  setListItemLoading(folder, id, true);
  ui.clearPreviewCanvas();
  beginPreviewLoading('Loading diagram…');
  try {
    await flushAutoSave();
    setPreviewLoadingPhase('fetch');

    const res = await fetch(loadUrl(folder, id));
    if (!res.ok) {
      ui.showStatus('Failed to load diagram', true);
      return false;
    }

    const data = await res.json();
    openDiagramInEditor(data, { deferRender: true });
    await renderOpenedDiagram();
    ui.showStatus(`Loaded ${data.id}`);
    return true;
  } finally {
    setListItemLoading(folder, id, false);
    endPreviewLoading();
  }
}

export async function saveIfDirty({ quiet = true } = {}) {
  if (!ctx.user?.login || !ctx.currentId || state.suppressAutoSave || state.saveInFlight) {
    return;
  }

  const code = ctx.editor.getValue();
  if (!state.contentDirty && !hasUnsavedChanges(code)) {
    return;
  }

  await saveDiagramWithId(ctx.currentId, { quiet, code });
}

export async function saveDiagramWithId(id, { quiet = false, folder, code } = {}) {
  if (state.saveInFlight) return;

  const targetFolder = folder !== undefined ? (folder || '') : ctx.currentFolder;
  const targetId = id !== undefined ? id : ctx.currentId;
  const payloadCode = code !== undefined ? code : ctx.editor.getValue();

  if (quiet && !hasUnsavedChanges(payloadCode) && !state.contentDirty) {
    return;
  }

  if (!quiet) dom.btnSave.disabled = true;
  state.saveInFlight = true;
  if (!quiet) beginSync('save', targetFolder, targetId);
  if (quiet) ui.showStatus('保存中…');

  try {
    const body = {
      id: id || undefined,
      folder: targetFolder || undefined,
      code: payloadCode,
    };
    if (ctx.currentUpdatedAt) {
      body.expectedUpdatedAt = ctx.currentUpdatedAt;
    }

    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error('已在别处修改，请刷新后重试');
      }
      throw new Error(data.error || 'Save failed');
    }

    ctx.currentId = data.id;
    ctx.currentFolder = data.folder || '';
    ctx.currentNumber = data.number ?? ctx.currentNumber;
    ctx.currentUpdatedAt = data.updatedAt ?? null;
    ui.setQueryDiagram(ctx.currentFolder, ctx.currentId);
    ctx.lastShareUrl = data.shareUrl || '';
    ctx.lastGithubUrl = data.githubUrl
      || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder, ctx.currentNumber);
    dom.shareUrlEl.textContent = ctx.lastShareUrl;
    dom.shareUrlEl.title = ctx.lastShareUrl;
    syncBaseline(payloadCode);
    clearContentDirty();
    ui.updateSaveHelpContent();

    if (!quiet) endSync('save', targetFolder, targetId);
    if (quiet) {
      ui.showStatus('已保存');
    } else {
      await loadDiagramList();
      ui.showStatus(`Saved to GitHub as ${ctx.currentFolder ? `${ctx.currentFolder}/` : ''}${ctx.currentId}`);
    }
  } catch (err) {
    if (!quiet) endSync('save', targetFolder, targetId);
    ui.showStatus(err.message || 'Save failed', true);
  } finally {
    state.saveInFlight = false;
    if (!quiet) dom.btnSave.disabled = false;
    if (state.contentDirty && quiet) {
      scheduleAutoSave();
    }
  }
}

export async function saveDiagram() {
  if (!ctx.user?.login) {
    ui.showStatus('Login with GitHub to save', true);
    return;
  }

  clearAutoSaveTimer();
  state.contentDirty = true;
  await saveDiagramWithId(ctx.currentId || undefined, { quiet: false });
}

export async function newDiagram() {
  if (!ctx.user?.login) {
    ui.showStatus('Login with GitHub to create diagrams', true);
    return;
  }

  await flushAutoSave();

  ctx.currentId = null;
  ctx.currentNumber = null;
  ctx.currentUpdatedAt = null;
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  ui.setQueryDiagram(ctx.currentFolder, null);
  dom.shareUrlEl.textContent = '';

  setSuppressAutoSave(true);
  clearContentDirty();
  ctx.editor.setValue(NEW_DIAGRAM_TEMPLATE);
  setSuppressAutoSave(false);
  ui.syncLayoutSelectFromCode();
  ui.scheduleRender();
  dom.diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));

  await saveDiagramWithId(undefined, { folder: ctx.currentFolder });
}

function findListLabel(folder, diagramId) {
  const li = findListItemByKey(dom.diagramList, folder, diagramId);
  return li?.querySelector('.diagram-item-label') || null;
}

function commitRenameLocally(oldId, newId, folder = '', { shareUrl, githubUrl, number, updatedAt } = {}) {
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
    if (number !== undefined) ctx.currentNumber = number;
    if (updatedAt !== undefined) ctx.currentUpdatedAt = updatedAt;
    ui.setQueryDiagram(folder, newId);
    ctx.lastShareUrl = shareUrl || buildShareUrl(folder, newId);
    ctx.lastGithubUrl = githubUrl
      || getGitHubFileUrl(ctx.user.username, newId, folder, ctx.currentNumber);
    dom.shareUrlEl.textContent = ctx.lastShareUrl;
    dom.shareUrlEl.title = ctx.lastShareUrl;
    ui.updateSaveHelpContent();
  }
}

export async function renameDiagram(oldId, newId, folder = '') {
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
      number: data.number,
      updatedAt: data.updatedAt,
    });
    endSync('rename', folder, oldId);
    await loadDiagramList();
    ui.showStatus(`已重命名为 ${newId}`);
  } catch (err) {
    endSync('rename', folder, oldId);
    ui.showStatus(err.message || '重命名失败', true);
  }
}

export async function moveDiagram(id, fromFolder = '', toFolder = '') {
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
      if (data.number !== undefined) ctx.currentNumber = data.number;
      if (data.updatedAt !== undefined) ctx.currentUpdatedAt = data.updatedAt;
      ui.setQueryDiagram(ctx.currentFolder, ctx.currentId);
      ctx.lastShareUrl = data.shareUrl || buildShareUrl(ctx.currentFolder, ctx.currentId);
      ctx.lastGithubUrl = data.githubUrl
        || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder, ctx.currentNumber);
      dom.shareUrlEl.textContent = ctx.lastShareUrl;
      dom.shareUrlEl.title = ctx.lastShareUrl;
      ui.updateSaveHelpContent();
    }

    endSync('rename', fromFolder, id);
    await loadDiagramList();
    ui.showStatus(`已移动到 ${folderLabel(toFolder)}`);
  } catch (err) {
    endSync('rename', fromFolder, id);
    ui.showStatus(err.message || '移动失败', true);
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

export async function duplicateDiagram(id, folder = '') {
  if (!ctx.user?.login) {
    ui.showStatus('Login required', true);
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
        ui.showStatus('Failed to load diagram', true);
        return;
      }
      const data = await res.json();
      code = data.code;
    }

    const data = await createDiagramFromCode(code, folder);
    await loadDiagram(data.id, data.folder || '');
    await loadDiagramList();
    ui.showStatus(`已复制为 ${data.id}`);
  } catch (err) {
    ui.showStatus(err.message || '复制失败', true);
  }
}

export async function removeDiagram(id, folder = '') {
  if (!ctx.user?.login) {
    ui.showStatus('Login required', true);
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
      await api.loadExample();
    }
    await loadDiagramList();

    ui.showStatus(`Deleted ${displayPath}`);
  } catch (err) {
    ui.showStatus(err.message || 'Delete failed', true);
  }
}
