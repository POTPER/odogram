export const dom = {
  diagramList: document.getElementById('diagram-list'),
  tagFilterBar: document.getElementById('diagram-tag-filter'),
  btnSave: document.getElementById('btn-save'),
  btnNewFolder: document.getElementById('btn-new-folder'),
  contextMenu: document.getElementById('diagram-context-menu'),
  folderContextMenu: document.getElementById('folder-context-menu'),
};

export const state = {
  suppressAutoSave: false,
  contentDirty: false,
  saveInFlight: false,
  autoSaveTimer: null,
  baselineCode: '',
  contextMenuTargetId: null,
  contextMenuTargetFolder: '',
  folderContextMenuTarget: '',
  activeTagFilter: '',
  lastDiagrams: [],
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
  updateToolbarDocInfo: () => {},
};

export const api = {};

export function wireDiagramApi(fns) {
  Object.assign(api, fns);
}
