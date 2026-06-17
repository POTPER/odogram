import { ctx, ID_PATTERN, NEW_DIAGRAM_TEMPLATE } from './app-context.js';
import { getGitHubFileUrl } from './auth-ui.js';
import { promptDiagramName, refreshDiagramIds } from './name-dialog.js';

const shareUrlEl = document.getElementById('share-url');
const diagramList = document.getElementById('diagram-list');
const btnSave = document.getElementById('btn-save');

let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;
let scheduleRenderFn = () => {};
let syncLayoutSelectFromCodeFn = () => {};
let setQueryIdFn = () => {};
let updateSaveHelpContentFn = () => {};
let renameEditLi = null;

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

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'diagram-rename-btn';
    renameBtn.title = 'Rename';
    renameBtn.setAttribute('aria-label', 'Rename');
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      startRenameEdit(li, item.id);
    });

    li.appendChild(btn);
    li.appendChild(renameBtn);
    diagramList.appendChild(li);
  }
}

async function loadDiagram(id) {
  if (!ctx.user?.login) {
    showStatusFn('Login required to load saved diagrams', true);
    return;
  }

  const res = await fetch(`/api/load?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    showStatusFn('Failed to load diagram', true);
    return;
  }

  const data = await res.json();
  ctx.currentId = data.id;
  ctx.editor.setValue(data.code);
  syncLayoutSelectFromCodeFn();
  setQueryIdFn(ctx.currentId);
  ctx.lastShareUrl = `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(ctx.currentId)}`;
  ctx.lastGithubUrl = getGitHubFileUrl(ctx.user.username, ctx.currentId);
  scheduleRenderFn();
  await loadDiagramList();
  updateSaveHelpContentFn();
  showStatusFn(`Loaded ${ctx.currentId}`);
}

async function saveDiagramWithId(id) {
  btnSave.disabled = true;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
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
    await loadDiagramList();
    updateSaveHelpContentFn();
    showStatusFn(`Saved to GitHub as ${ctx.currentId}`);
  } catch (err) {
    showStatusFn(err.message || 'Save failed', true);
  } finally {
    btnSave.disabled = false;
  }
}

async function saveDiagram() {
  if (!ctx.user?.login) {
    showStatusFn('Login with GitHub to save', true);
    return;
  }

  if (ctx.currentId) {
    await saveDiagramWithId(ctx.currentId);
    return;
  }

  await refreshDiagramIds();
  const result = await promptDiagramName({ title: 'Diagram name' });
  if (!result) return;

  await saveDiagramWithId(result.id);
}

async function newDiagram() {
  if (!ctx.user?.login) {
    showStatusFn('Login with GitHub to create diagrams', true);
    return;
  }

  await refreshDiagramIds();
  const result = await promptDiagramName({ title: 'New diagram' });
  if (!result) return;

  ctx.editor.setValue(NEW_DIAGRAM_TEMPLATE);
  syncLayoutSelectFromCodeFn();
  ctx.lastShareUrl = '';
  ctx.lastGithubUrl = '';
  setQueryIdFn(null);
  shareUrlEl.textContent = '';
  scheduleRenderFn();
  diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));

  await saveDiagramWithId(result.id);
}

function cancelRenameEdit() {
  if (!renameEditLi) return;
  const oldId = renameEditLi.dataset.diagramId;
  const renameBtn = renameEditLi.querySelector('.diagram-rename-btn');
  const input = renameEditLi.querySelector('.diagram-rename-input');
  if (input) {
    const label = document.createElement('span');
    label.className = 'diagram-item-label';
    label.textContent = oldId;
    input.replaceWith(label);
  }
  if (renameBtn) renameBtn.hidden = false;
  renameEditLi = null;
}

function startRenameEdit(li, oldId) {
  if (renameEditLi && renameEditLi !== li) cancelRenameEdit();

  const loadBtn = li.querySelector('.diagram-item-btn');
  const label = loadBtn.querySelector('.diagram-item-label');
  const renameBtn = li.querySelector('.diagram-rename-btn');
  if (!label || !renameBtn) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'diagram-rename-input';
  input.value = oldId;
  label.replaceWith(input);
  renameBtn.hidden = true;
  renameEditLi = li;
  li.dataset.diagramId = oldId;
  input.focus();
  input.select();

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renameDiagram(oldId, input.value.trim());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRenameEdit();
    }
  });
}

async function renameDiagram(oldId, newId) {
  if (oldId === newId) {
    cancelRenameEdit();
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

    renameEditLi = null;

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
    const res = await fetch('/diagrams/example.mmd');
    if (!res.ok) throw new Error('Failed to load example');
    ctx.editor.setValue(await res.text());
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

  return {
    saveDiagram,
    loadExample,
    copySource,
    newDiagram,
    loadDiagram,
    loadDiagramList,
  };
}
