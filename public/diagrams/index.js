import {
  markContentDirty,
  onPreviewRendered,
  scheduleAutoSave,
} from './autosave.js';
import * as crud from './crud.js';
import * as examples from './examples.js';
import { initContextMenu, loadDiagramList } from './sidebar.js';
import { isCurrentDiagram } from './utils.js';
import { wireDiagramApi, ui } from './registry.js';

wireDiagramApi({
  saveIfDirty: crud.saveIfDirty,
  saveDiagramWithId: crud.saveDiagramWithId,
  loadDiagram: crud.loadDiagram,
  loadDiagramList,
  renameDiagram: crud.renameDiagram,
  moveDiagram: crud.moveDiagram,
  duplicateDiagram: crud.duplicateDiagram,
  removeDiagram: crud.removeDiagram,
  openDiagramInEditor: crud.openDiagramInEditor,
  loadExample: examples.loadExample,
  isCurrentDiagram,
});

export function initDiagrams({
  showStatus,
  clearPersistentStatus,
  escapeHtml,
  scheduleRender,
  renderPreviewNow,
  waitForPreviewSettled,
  clearPreviewCanvas,
  syncLayoutSelectFromCode,
  setQueryDiagram,
  updateSaveHelpContent,
}) {
  ui.showStatus = showStatus;
  ui.clearPersistentStatus = clearPersistentStatus;
  ui.escapeHtml = escapeHtml;
  ui.scheduleRender = scheduleRender;
  ui.renderPreviewNow = renderPreviewNow;
  ui.waitForPreviewSettled = waitForPreviewSettled;
  ui.clearPreviewCanvas = clearPreviewCanvas;
  ui.syncLayoutSelectFromCode = syncLayoutSelectFromCode;
  ui.setQueryDiagram = setQueryDiagram;
  ui.updateSaveHelpContent = updateSaveHelpContent;

  initContextMenu();

  return {
    saveDiagram: crud.saveDiagram,
    loadWelcome: examples.loadWelcome,
    loadExample: examples.loadExample,
    loadProductExample: examples.loadProductExample,
    copySource: examples.copySource,
    newDiagram: crud.newDiagram,
    loadDiagram: crud.loadDiagram,
    loadDiagramList,
    scheduleAutoSave,
    markContentDirty,
    onPreviewRendered,
  };
}
