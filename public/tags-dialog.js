import { ctx } from './app-context.js';
import { validateTags, parseTags } from './tag-utils.js';
import { saveDiagramWithId } from './diagrams/crud.js';

const tagsDialogBackdrop = document.getElementById('tags-dialog-backdrop');
const tagsDialog = document.getElementById('tags-dialog');
const tagsDialogInput = document.getElementById('tags-dialog-input');
const tagsDialogError = document.getElementById('tags-dialog-error');
const tagsDialogCancel = document.getElementById('tags-dialog-cancel');
const tagsDialogConfirm = document.getElementById('tags-dialog-confirm');

let tagsDialogResolver = null;

function setTagsDialogError(message) {
  if (message) {
    tagsDialogError.textContent = message;
    tagsDialogError.hidden = false;
  } else {
    tagsDialogError.textContent = '';
    tagsDialogError.hidden = true;
  }
}

function closeTagsDialog(result) {
  tagsDialogBackdrop.hidden = true;
  document.removeEventListener('keydown', onTagsDialogKeydown);
  if (tagsDialogResolver) {
    tagsDialogResolver(result);
    tagsDialogResolver = null;
  }
}

function onTagsDialogKeydown(event) {
  if (tagsDialogBackdrop.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTagsDialog(null);
  }
}

function tryConfirmTagsDialog() {
  const tags = parseTags(tagsDialogInput.value);
  const error = validateTags(tags);
  if (error) {
    setTagsDialogError(error);
    return;
  }
  closeTagsDialog({ tags });
}

export function promptTags({ defaultValue = '' } = {}) {
  const initial = Array.isArray(defaultValue)
    ? defaultValue.join(', ')
    : defaultValue;

  return new Promise((resolve) => {
    tagsDialogResolver = resolve;
    tagsDialogInput.value = initial;
    setTagsDialogError(null);
    tagsDialogBackdrop.hidden = false;
    document.addEventListener('keydown', onTagsDialogKeydown);
    tagsDialogInput.focus();
    tagsDialogInput.select();
  });
}

export async function editDiagramTags({ folder, id, tags: initialTags, isCurrent = false } = {}) {
  const result = await promptTags({
    defaultValue: isCurrent ? ctx.currentTags : initialTags,
  });
  if (!result) return;

  if (isCurrent) {
    ctx.currentTags = result.tags;
    if (ctx.currentId && ctx.user?.login) {
      await saveDiagramWithId(ctx.currentId, { quiet: true, folder: ctx.currentFolder });
    }
    return result.tags;
  }

  if (!id || !ctx.user?.login) return result.tags;

  const res = await fetch('/api/load?' + new URLSearchParams({
    id,
    ...(folder ? { folder } : {}),
  }));
  if (!res.ok) throw new Error('Failed to load diagram');

  const data = await res.json();
  await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      folder: folder || undefined,
      code: data.code,
      tags: result.tags,
      expectedUpdatedAt: data.updatedAt,
    }),
  });

  return result.tags;
}

export function initTagsDialog() {
  tagsDialogBackdrop?.addEventListener('click', () => closeTagsDialog(null));
  tagsDialog?.addEventListener('click', (event) => event.stopPropagation());
  tagsDialogCancel?.addEventListener('click', () => closeTagsDialog(null));
  tagsDialogConfirm?.addEventListener('click', () => tryConfirmTagsDialog());
  tagsDialogInput?.addEventListener('input', () => setTagsDialogError(null));
  tagsDialogInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      tryConfirmTagsDialog();
    }
  });
}
