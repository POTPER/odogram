export const dom = {
  shareUrlEl: document.getElementById('share-url'),
  diagramList: document.getElementById('diagram-list'),
  btnSave: document.getElementById('btn-save'),
  contextMenu: document.getElementById('diagram-context-menu'),
};

export const state = {
  suppressAutoSave: false,
  contentDirty: false,
  saveInFlight: false,
  autoSaveTimer: null,
  baselineCode: '',
  contextMenuTargetId: null,
  contextMenuTargetFolder: '',
  syncRefs: new Map(),
};

export const ui = {
  showStatus: () => {},
  clearPersistentStatus: () => {},
  escapeHtml: (str) => str,
  scheduleRender: () => {},
  renderPreviewNow: async () => {},
  waitForPreviewSettled: () => Promise.resolve(),
  clearPreviewCanvas: () => {},
  syncLayoutSelectFromCode: () => {},
  setQueryDiagram: () => {},
  updateSaveHelpContent: () => {},
};

export const api = {};

export function wireDiagramApi(fns) {
  Object.assign(api, fns);
}
