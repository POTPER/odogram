import { ctx } from './app-context.js';
import { renameDiagram, saveDiagramWithId } from './diagrams/crud.js';
import { validateDiagramId, isDiagramIdTaken } from './name-dialog.js';
import { updateToolbarDocInfo, getToolbarDocDisplayTitle, setToolbarDocTitleUpdatePaused } from './toolbar-doc.js';

const toolbarDocTitleRow = document.querySelector('.toolbar-doc-title-row');
const toolbarDocTitle = document.getElementById('toolbar-doc-title');
const toolbarDocTitleInput = document.getElementById('toolbar-doc-title-input');
const btnToolbarDocRename = document.getElementById('btn-toolbar-doc-rename');

let editing = false;
let showStatusFn = () => {};

export function isToolbarDocEditing() {
  return editing;
}

export function updateToolbarDocRenameVisibility() {
  if (!btnToolbarDocRename) return;
  const canEdit = !!ctx.user?.login;
  btnToolbarDocRename.hidden = !canEdit;
  if (toolbarDocTitle) {
    toolbarDocTitle.classList.toggle('is-editable', canEdit);
  }
}

function canStartEdit() {
  return !!ctx.user?.login && !editing;
}

function startEdit() {
  if (!canStartEdit() || !toolbarDocTitleInput || !toolbarDocTitle) return;

  editing = true;
  setToolbarDocTitleUpdatePaused(true);
  const currentTitle = getToolbarDocDisplayTitle();
  toolbarDocTitle.hidden = true;
  btnToolbarDocRename.hidden = true;
  toolbarDocTitleInput.hidden = false;
  toolbarDocTitleInput.value = ctx.currentId || (currentTitle === 'Untitled' ? '' : currentTitle);
  toolbarDocTitleInput.focus();
  toolbarDocTitleInput.select();
  toolbarDocTitleRow?.classList.add('is-editing');
}

function endEdit() {
  if (!toolbarDocTitleInput || !toolbarDocTitle) return;

  editing = false;
  setToolbarDocTitleUpdatePaused(false);
  toolbarDocTitleInput.hidden = true;
  toolbarDocTitle.hidden = false;
  toolbarDocTitleRow?.classList.remove('is-editing');
  updateToolbarDocRenameVisibility();
  updateToolbarDocInfo();
}

function validateName(id) {
  const formatError = validateDiagramId(id);
  if (formatError) return formatError;

  const excludeId = ctx.currentId || null;
  if (isDiagramIdTaken(id, excludeId)) {
    return `"${id}" 已存在，请换一个名称。`;
  }

  return null;
}

async function confirmEdit() {
  if (!editing || !toolbarDocTitleInput) return;

  const newId = toolbarDocTitleInput.value.trim();
  const error = validateName(newId);
  if (error) {
    showStatusFn(error, true);
    toolbarDocTitleInput.focus();
    toolbarDocTitleInput.select();
    return;
  }

  if (ctx.currentId) {
    if (newId === ctx.currentId) {
      endEdit();
      return;
    }

    await renameDiagram(ctx.currentId, newId, ctx.currentFolder);
    if (ctx.currentId === newId) {
      endEdit();
    }
    return;
  }

  await saveDiagramWithId(newId, { quiet: false });
  if (ctx.currentId === newId) {
    endEdit();
  }
}

function cancelEdit() {
  if (!editing) return;
  endEdit();
}

function onEditKeydown(event) {
  if (!editing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  }
}

export function initToolbarDocEdit({ showStatus } = {}) {
  showStatusFn = showStatus || showStatusFn;

  btnToolbarDocRename?.addEventListener('click', (event) => {
    event.stopPropagation();
    startEdit();
  });

  toolbarDocTitle?.addEventListener('click', () => {
    if (canStartEdit()) startEdit();
  });

  toolbarDocTitleInput?.addEventListener('keydown', onEditKeydown);
  toolbarDocTitleInput?.addEventListener('blur', () => {
    if (editing) confirmEdit();
  });

  updateToolbarDocRenameVisibility();
}
