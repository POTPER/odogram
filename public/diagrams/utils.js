import { ctx, diagramKey } from '../app-context.js';

export function buildShareUrl(folder, id) {
  const origin = window.location.origin;
  const user = ctx.user?.username;
  if (!user || !id) return '';
  if (folder) {
    return `${origin}/view/${encodeURIComponent(user)}/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`;
  }
  return `${origin}/view/${encodeURIComponent(user)}/${encodeURIComponent(id)}`;
}

export function loadUrl(folder, id) {
  const params = new URLSearchParams({ id });
  if (folder) params.set('folder', folder);
  return `/api/load?${params}`;
}

export function isCurrentDiagram(folder, id) {
  return ctx.currentId === id && (ctx.currentFolder || '') === (folder || '');
}

export function findListItemByKey(diagramList, folder, id) {
  const key = diagramKey(folder, id);
  for (const li of diagramList.querySelectorAll('.diagram-list-item')) {
    if (diagramKey(li.dataset.diagramFolder || '', li.dataset.diagramId) === key) {
      return li;
    }
  }
  return null;
}
