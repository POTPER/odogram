import { ctx, ID_FORMAT_HINT, ID_PATTERN } from './app-context.js';

const nameDialogBackdrop = document.getElementById('name-dialog-backdrop');
const nameDialog = document.getElementById('name-dialog');
const nameDialogTitle = document.getElementById('name-dialog-title');
const nameDialogInput = document.getElementById('name-dialog-input');
const nameDialogError = document.getElementById('name-dialog-error');
const nameDialogCancel = document.getElementById('name-dialog-cancel');
const nameDialogConfirm = document.getElementById('name-dialog-confirm');
const nameDialogOverwrite = document.getElementById('name-dialog-overwrite');

let nameDialogResolver = null;

function validateDiagramId(id) {
  if (!ID_PATTERN.test(id)) {
    return ID_FORMAT_HINT;
  }
  return null;
}

function isDiagramIdTaken(id) {
  return ctx.diagramIds.has(id);
}

function setNameDialogError(message) {
  if (message) {
    nameDialogError.textContent = message;
    nameDialogError.hidden = false;
  } else {
    nameDialogError.textContent = '';
    nameDialogError.hidden = true;
  }
}

function closeNameDialog(result) {
  nameDialogBackdrop.hidden = true;
  document.removeEventListener('keydown', onNameDialogKeydown);
  if (nameDialogResolver) {
    nameDialogResolver(result);
    nameDialogResolver = null;
  }
}

function onNameDialogKeydown(event) {
  if (nameDialogBackdrop.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeNameDialog(null);
  }
}

function tryConfirmNameDialog({ overwrite = false } = {}) {
  const id = nameDialogInput.value.trim();
  const formatError = validateDiagramId(id);
  if (formatError) {
    setNameDialogError(formatError);
    nameDialogOverwrite.hidden = true;
    return;
  }

  if (isDiagramIdTaken(id) && !overwrite) {
    setNameDialogError(`"${id}" already exists. Choose another name or click Overwrite.`);
    nameDialogOverwrite.hidden = false;
    return;
  }

  closeNameDialog({ id, overwrite: overwrite || isDiagramIdTaken(id) });
}

export async function refreshDiagramIds() {
  if (!ctx.user?.login) {
    ctx.diagramIds = new Set();
    return;
  }

  const res = await fetch('/api/list');
  if (!res.ok) return;

  const { diagrams } = await res.json();
  ctx.diagramIds = new Set(diagrams.map((item) => item.id));
}

export function promptDiagramName({ title = 'Diagram name', defaultValue = '' } = {}) {
  return new Promise((resolve) => {
    nameDialogResolver = resolve;
    nameDialogTitle.textContent = title;
    nameDialogInput.value = defaultValue;
    setNameDialogError(null);
    nameDialogOverwrite.hidden = true;
    nameDialogBackdrop.hidden = false;
    document.addEventListener('keydown', onNameDialogKeydown);
    nameDialogInput.focus();
    nameDialogInput.select();
  });
}

export function initNameDialog() {
  nameDialogBackdrop.addEventListener('click', () => closeNameDialog(null));
  nameDialog.addEventListener('click', (event) => event.stopPropagation());
  nameDialogCancel.addEventListener('click', () => closeNameDialog(null));
  nameDialogConfirm.addEventListener('click', () => tryConfirmNameDialog());
  nameDialogOverwrite.addEventListener('click', () => tryConfirmNameDialog({ overwrite: true }));
  nameDialogInput.addEventListener('input', () => {
    setNameDialogError(null);
    nameDialogOverwrite.hidden = true;
  });
  nameDialogInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      tryConfirmNameDialog();
    }
  });
}
