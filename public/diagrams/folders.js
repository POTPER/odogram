import { ctx } from '../app-context.js';
import { api, ui } from './registry.js';
import { newDiagram } from './crud.js';
import { isCurrentDiagram } from './utils.js';

export async function newDiagramInFolder(folder) {
  ctx.currentFolder = folder || '';
  await newDiagram();
}

export async function renameFolder(oldFolder, newFolder) {
  const res = await fetch('/api/rename-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldFolder, newFolder }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Rename folder failed');
  }

  if (isCurrentDiagram(oldFolder, ctx.currentId) || ctx.currentFolder === oldFolder) {
    ctx.currentFolder = newFolder;
    ui.setQueryDiagram(ctx.currentFolder, ctx.currentId);
    ui.updateSaveHelpContent();
    ctx.shareUI?.updateShareUI?.();
  }

  await api.loadDiagramList();
  ui.showStatus(`文件夹已重命名为 ${newFolder}`);
}
