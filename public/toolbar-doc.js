import { ctx } from './app-context.js';
import { findGuestExample } from './diagrams/guest-catalog.js';

const toolbarDocTitle = document.getElementById('toolbar-doc-title');
const toolbarDocAuthor = document.getElementById('toolbar-doc-author');

let titleUpdatePaused = false;

export function setToolbarDocTitleUpdatePaused(paused) {
  titleUpdatePaused = paused;
}

export function getToolbarDocDisplayTitle() {
  if (ctx.currentGuestExampleId) {
    return findGuestExample(ctx.currentGuestExampleId)?.label ?? ctx.currentGuestExampleId;
  }
  if (ctx.currentId) {
    return ctx.currentId;
  }
  return 'Untitled';
}

export function updateToolbarDocInfo() {
  if (!toolbarDocTitle || !toolbarDocAuthor) return;

  toolbarDocAuthor.textContent = ctx.user?.login ? ctx.user.username : '访客';
  if (!titleUpdatePaused) {
    toolbarDocTitle.textContent = getToolbarDocDisplayTitle();
  }
}
