import { ctx, EXAMPLE_FOLDER, EXAMPLE_ID } from '../app-context.js';
import {
  clearAutoSaveTimer,
  clearContentDirty,
  flushAutoSave,
  setSuppressAutoSave,
  syncBaseline,
} from './autosave.js';
import { openDiagramInEditor, saveDiagramWithId } from './crud.js';
import { dom, ui } from './registry.js';
import { loadUrl } from './utils.js';

export async function loadStaticExample() {
  const res = await fetch('/diagrams/example.mmd');
  if (!res.ok) throw new Error('Failed to load example');

  setSuppressAutoSave(true);
  clearAutoSaveTimer();
  clearContentDirty();
  const text = await res.text();
  ctx.editor.setValue(text);
  syncBaseline(text);
  setSuppressAutoSave(false);
  ui.syncLayoutSelectFromCode();
  ctx.currentId = null;
  ctx.currentFolder = '';
  ctx.currentNumber = null;
  ctx.currentUpdatedAt = null;
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  ui.setQueryDiagram('', null);
  dom.shareUrlEl.textContent = '';
  ui.scheduleRender();
  dom.diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));
  ui.updateSaveHelpContent();
}

export async function loadWelcome() {
  await flushAutoSave();

  const res = await fetch('/diagrams/oproduct-欢迎.oprd');
  if (!res.ok) throw new Error('Failed to load product map');

  setSuppressAutoSave(true);
  clearAutoSaveTimer();
  clearContentDirty();
  const text = await res.text();
  ctx.editor.setValue(text);
  syncBaseline(text);
  setSuppressAutoSave(false);
  ctx.currentId = null;
  ctx.currentFolder = '';
  ctx.currentNumber = null;
  ctx.currentUpdatedAt = null;
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  ui.setQueryDiagram('', null);
  dom.shareUrlEl.textContent = '';
  ui.scheduleRender();
  dom.diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));
  ui.updateSaveHelpContent();
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
  try {
    await flushAutoSave();

    if (!ctx.user?.login) {
      await loadStaticExample();
      ui.showStatus('Example loaded');
      return;
    }

    const folder = EXAMPLE_FOLDER;
    const id = EXAMPLE_ID;
    const res = await fetch(loadUrl(folder, id));

    if (res.ok) {
      openDiagramInEditor(await res.json());
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
      });
      ui.showStatus('已打开示例');
      return;
    }

    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load example');
  } catch (err) {
    ui.showStatus(err.message || 'Failed to load example', true);
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
