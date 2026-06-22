import { ctx, ID_FORMAT_HINT, ID_PATTERN } from './app-context.js';

const folderDialogBackdrop = document.getElementById('folder-dialog-backdrop');
const folderDialog = document.getElementById('folder-dialog');
const folderDialogTitle = document.getElementById('folder-dialog-title');
const folderDialogHint = document.getElementById('folder-dialog-hint');
const folderDialogInput = document.getElementById('folder-dialog-input');
const folderDialogError = document.getElementById('folder-dialog-error');
const folderDialogList = document.getElementById('folder-dialog-list');
const folderDialogCancel = document.getElementById('folder-dialog-cancel');
const folderDialogConfirm = document.getElementById('folder-dialog-confirm');

let folderDialogResolver = null;
let folderDialogMode = 'move';
let folderDialogExcludeFolder = null;

export function validateFolderName(folder, { allowEmpty = false } = {}) {
  if (!folder) {
    return allowEmpty ? null : '请输入文件夹名称';
  }
  if (!ID_PATTERN.test(folder)) {
    return ID_FORMAT_HINT;
  }
  return null;
}

function isFolderTaken(folder) {
  if (folderDialogExcludeFolder && folder === folderDialogExcludeFolder) return false;
  return ctx.diagramFolders.includes(folder);
}

function setFolderDialogError(message) {
  if (message) {
    folderDialogError.textContent = message;
    folderDialogError.hidden = false;
  } else {
    folderDialogError.textContent = '';
    folderDialogError.hidden = true;
  }
}

function renderFolderPickerList() {
  if (!folderDialogList) return;
  folderDialogList.replaceChildren();

  const allowEmpty = folderDialogMode === 'move';
  if (allowEmpty) {
    const ungroupedBtn = document.createElement('button');
    ungroupedBtn.type = 'button';
    ungroupedBtn.className = 'folder-dialog-option';
    ungroupedBtn.textContent = '未分组';
    ungroupedBtn.addEventListener('click', () => {
      folderDialogInput.value = '';
      setFolderDialogError(null);
    });
    folderDialogList.appendChild(ungroupedBtn);
  }

  for (const folder of ctx.diagramFolders.filter(Boolean)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-dialog-option';
    btn.textContent = folder;
    btn.addEventListener('click', () => {
      folderDialogInput.value = folder;
      setFolderDialogError(null);
    });
    folderDialogList.appendChild(btn);
  }
}

function closeFolderDialog(result) {
  folderDialogBackdrop.hidden = true;
  folderDialogExcludeFolder = null;
  document.removeEventListener('keydown', onFolderDialogKeydown);
  if (folderDialogResolver) {
    folderDialogResolver(result);
    folderDialogResolver = null;
  }
}

function onFolderDialogKeydown(event) {
  if (folderDialogBackdrop.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeFolderDialog(null);
  }
}

function tryConfirmFolderDialog() {
  const folder = folderDialogInput.value.trim();
  const allowEmpty = folderDialogMode === 'move';
  const formatError = validateFolderName(folder, { allowEmpty });
  if (formatError) {
    setFolderDialogError(formatError);
    return;
  }

  if (folderDialogMode === 'create' && isFolderTaken(folder)) {
    setFolderDialogError(`文件夹 "${folder}" 已存在`);
    return;
  }

  if (folderDialogMode === 'rename' && folder !== folderDialogExcludeFolder && isFolderTaken(folder)) {
    setFolderDialogError(`文件夹 "${folder}" 已存在`);
    return;
  }

  if (folderDialogMode === 'rename' && folder === folderDialogExcludeFolder) {
    closeFolderDialog(null);
    return;
  }

  closeFolderDialog({ folder });
}

export function promptFolder({
  mode = 'move',
  title = '选择文件夹',
  defaultValue = '',
  excludeFolder = null,
  hint = ID_FORMAT_HINT,
} = {}) {
  return new Promise((resolve) => {
    folderDialogResolver = resolve;
    folderDialogMode = mode;
    folderDialogExcludeFolder = excludeFolder;
    folderDialogTitle.textContent = title;
    folderDialogHint.textContent = mode === 'move'
      ? `${hint}。留空表示「未分组」。`
      : hint;
    folderDialogInput.value = defaultValue;
    setFolderDialogError(null);
    renderFolderPickerList();
    folderDialogBackdrop.hidden = false;
    document.addEventListener('keydown', onFolderDialogKeydown);
    folderDialogInput.focus();
    folderDialogInput.select();
  });
}

export function initFolderDialog() {
  folderDialogBackdrop?.addEventListener('click', () => closeFolderDialog(null));
  folderDialog?.addEventListener('click', (event) => event.stopPropagation());
  folderDialogCancel?.addEventListener('click', () => closeFolderDialog(null));
  folderDialogConfirm?.addEventListener('click', () => tryConfirmFolderDialog());
  folderDialogInput?.addEventListener('input', () => setFolderDialogError(null));
  folderDialogInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      tryConfirmFolderDialog();
    }
  });
}
