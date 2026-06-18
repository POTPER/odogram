import { ctx, EXAMPLE_FOLDER, EXAMPLE_ID } from '../app-context.js';
import {
  clearAutoSaveTimer,
  clearContentDirty,
  flushAutoSave,
  setSuppressAutoSave,
  syncBaseline,
} from './autosave.js';
import { openDiagramInEditor, saveDiagramWithId } from './crud.js';
import { ui } from './registry.js';
import { loadUrl } from './utils.js';
import { findGuestExample } from './guest-catalog.js';
import { updateListActiveState } from './sidebar.js';
import {
  beginPreviewLoading,
  endPreviewLoading,
  setPreviewLoadingPhase,
} from '../preview-loading.js';

async function applyStaticSource(text, { guestExampleId = null } = {}) {
  setSuppressAutoSave(true);
  clearAutoSaveTimer();
  clearContentDirty();
  ctx.editor.setValue(text);
  syncBaseline(text);
  setSuppressAutoSave(false);
  ctx.currentId = null;
  ctx.currentFolder = '';
  ctx.currentNumber = null;
  ctx.currentUpdatedAt = null;
  ctx.currentGuestExampleId = guestExampleId;
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  ui.setQueryDiagram('', null);
  ctx.shareUI?.updateShareUI?.();
  ui.updateSaveHelpContent();
  ui.updateToolbarDocInfo();
  updateListActiveState();
}

async function renderLoadedSource() {
  setPreviewLoadingPhase('render');
  await ui.renderPreviewNow();
  await ui.waitForPreviewSettled();
}

export async function loadGuestExample({ id, path, label }) {
  ui.clearPreviewCanvas();
  beginPreviewLoading('Loading diagram…');
  try {
    await flushAutoSave();
    setPreviewLoadingPhase('fetch');

    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${label || id}`);

    const text = await res.text();
    await applyStaticSource(text, { guestExampleId: id });
    ui.syncLayoutSelectFromCode();
    await renderLoadedSource();
  } finally {
    endPreviewLoading();
  }
}

export async function loadStaticExample() {
  const item = findGuestExample('example');
  if (!item) throw new Error('Failed to load example');
  await loadGuestExample(item);
}

export async function loadWelcome() {
  const item = findGuestExample('oproduct-欢迎');
  if (!item) throw new Error('Failed to load product map');
  await loadGuestExample(item);
}

export async function loadProductExample() {
  try {
    await loadWelcome();
    ui.showStatus('产品构成图已加载');
  } catch (err) {
    ui.showStatus(err.message || 'Failed to load product map', true);
  }
}

export async function loadExample() {
  ui.clearPreviewCanvas();
  beginPreviewLoading('Loading diagram…');
  try {
    await flushAutoSave();

    if (!ctx.user?.login) {
      const item = findGuestExample('example');
      if (!item) throw new Error('Failed to load example');
      setPreviewLoadingPhase('fetch');
      const res = await fetch(item.path);
      if (!res.ok) throw new Error('Failed to load example');
      const text = await res.text();
      await applyStaticSource(text, { guestExampleId: item.id });
      ui.syncLayoutSelectFromCode();
      await renderLoadedSource();
      ui.showStatus('Example loaded');
      return;
    }

    const folder = EXAMPLE_FOLDER;
    const id = EXAMPLE_ID;
    setPreviewLoadingPhase('fetch');
    const res = await fetch(loadUrl(folder, id));

    if (res.ok) {
      openDiagramInEditor(await res.json(), { deferRender: true });
      await renderLoadedSource();
      ui.showStatus('已打开示例');
      return;
    }

    if (res.status === 404) {
      const templateRes = await fetch('/diagrams/example.mmd');
      if (!templateRes.ok) throw new Error('Failed to load example');
      const code = await templateRes.text();
      await saveDiagramWithId(id, { folder, code, quiet: true });
      openDiagramInEditor({
        id,
        folder,
        code,
        shareUrl: ctx.lastShareUrl,
        githubUrl: ctx.lastGithubUrl,
        number: ctx.currentNumber,
        updatedAt: ctx.currentUpdatedAt,
      }, { deferRender: true });
      await renderLoadedSource();
      ui.showStatus('已打开示例');
      return;
    }

    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load example');
  } catch (err) {
    ui.showStatus(err.message || 'Failed to load example', true);
  } finally {
    endPreviewLoading();
  }
}

export async function copySource() {
  try {
    await navigator.clipboard.writeText(ctx.editor.getValue());
    ui.showStatus('Source copied');
  } catch {
    ui.showStatus('Copy failed', true);
  }
}
