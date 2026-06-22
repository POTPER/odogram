import mermaid from 'mermaid';
import elkLayouts from 'elk-layouts';
import { cursorDarkTheme } from './theme.js';
import { createMermaidEditor } from './editor.js';
import { applyLayoutFrontmatter, LAYOUT_MODES, parseLayoutFromCode } from './layout.js';
import { initLayoutUI } from './layout-ui.js';
import { ctx } from './app-context.js';
import { initPreview } from './preview.js';
import { initNameDialog } from './name-dialog.js';
import { initFolderDialog } from './folder-dialog.js';
import { initTagsDialog } from './tags-dialog.js';
import { initLoginDialog, closeLoginDialog } from './login-dialog.js';
import { initAiDialog, closeAiDialog } from './ai-dialog.js';
import { initAssetsPanel, closeAssetsPanel } from './assets-panel.js';
import { initToolbarDocEdit } from './toolbar-doc-edit.js';
import { initAuthUI } from './auth-ui.js';
import { initSettingsUI } from './settings-ui.js';
import { initShareUI } from './share-ui.js';
import { updateToolbarDocInfo } from './toolbar-doc.js';
import { initDiagrams } from './diagrams/index.js';
import {
  appendStatusLog,
  clearStatusBarTransient,
  initStatusLog,
  renderLatest,
} from './status-log.js';
import { initConsoleLogPanel, closeConsoleLogPanel } from './console-log-panel.js';

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({
  ...cursorDarkTheme,
  startOnLoad: false,
});

const editorRoot = document.getElementById('editor-root');
const statusEl = document.getElementById('status-message');
const layoutSelect = document.getElementById('layout-select');
const btnSave = document.getElementById('btn-save');
const btnCopy = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');
const btnExample = document.getElementById('btn-example');
const btnProduct = document.getElementById('btn-product');
const layoutSelectWrap = document.querySelector('.layout-select-wrap');
const btnLogout = document.getElementById('btn-logout');
const btnUserToggle = document.getElementById('btn-user-toggle');
const btnDiagrams = document.getElementById('btn-diagrams');
const btnNewDiagram = document.getElementById('btn-new-diagram');

let layoutSyncing = false;
let scheduleRender = () => {};
let scheduleAutoSave = () => {};
let markContentDirty = () => {};
let previewApi;
let authApi;
let settingsApi;
let shareApi;
let diagramApi;

function showStatus(message, options = false) {
  const opts = typeof options === 'boolean' ? { isError: options } : options;
  const { isError = false, persistent = false, timestamp } = opts;

  if (persistent) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
    statusEl.classList.add('syncing');
    return;
  }

  statusEl.classList.remove('syncing');
  appendStatusLog(message, { isError, timestamp });
}

function clearPersistentStatus() {
  clearStatusBarTransient();
  renderLatest();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncLayoutSelectFromCode() {
  if (!ctx.editor || !layoutSelect) return;
  layoutSyncing = true;
  layoutSelect.value = parseLayoutFromCode(ctx.editor.getValue());
  layoutSyncing = false;
}

function handleLayoutChange() {
  if (layoutSyncing || !ctx.editor) return;

  const layout = layoutSelect.value;
  const code = applyLayoutFrontmatter(ctx.editor.getValue(), layout);
  ctx.editor.setValue(code);
  syncLayoutSelectFromCode();
  scheduleRender();
  showStatus(`Layout: ${LAYOUT_MODES[layout]}`);
}

function getQueryDiagram() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get('id'),
    folder: params.get('folder') || '',
  };
}

function setQueryDiagram(folder, id) {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set('id', id);
    if (folder) {
      url.searchParams.set('folder', folder);
    } else {
      url.searchParams.delete('folder');
    }
  } else {
    url.searchParams.delete('id');
    url.searchParams.delete('folder');
  }
  window.history.replaceState({}, '', url);
}

function syncDownloadButton(isOproduct) {
  if (!btnDownload) return;
  btnDownload.disabled = isOproduct;
  btnDownload.title = isOproduct
    ? 'SVG export is only available for Mermaid diagrams'
    : 'Download SVG';
}

function bindToolbar() {
  btnSave.addEventListener('click', () => diagramApi.saveDiagram());
  btnUserToggle.addEventListener('click', authApi.toggleUserMenu);
  btnDiagrams.addEventListener('click', () => {
    ctx.layoutUI?.setSidebarOpen?.(!document.body.classList.contains('sidebar-open'));
  });
  btnNewDiagram.addEventListener('click', () => diagramApi.newDiagram());
  btnCopy.addEventListener('click', () => diagramApi.copySource());
  layoutSelect.addEventListener('change', handleLayoutChange);
  btnDownload.addEventListener('click', () => previewApi.downloadSvg());
  btnExample.addEventListener('click', () => diagramApi.loadExample());
  btnProduct.addEventListener('click', () => diagramApi.loadProductExample());

  window.addEventListener('odogram:format-change', (event) => {
    const isOproduct = event.detail?.format === 'oproduct';
    if (layoutSelectWrap) {
      layoutSelectWrap.hidden = isOproduct;
    }
    syncDownloadButton(isOproduct);
  });
  btnLogout.addEventListener('click', () => {
    window.location.href = '/auth/logout';
  });
}

async function init() {
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  }, { capture: true });

  try {
    ctx.editor = createMermaidEditor(editorRoot, {
      onChange: () => {
        scheduleRender();
        markContentDirty();
        scheduleAutoSave();
      },
    });
  } catch (err) {
    console.error('Editor initialization failed:', err);
    showStatus('Editor failed to load — check console for details', true);
    return;
  }

  previewApi = initPreview({
    showStatus,
    escapeHtml,
    onRenderSuccess: () => diagramApi?.onPreviewRendered?.(),
    getSource: () => ctx.editor?.getValue() ?? '',
    setSource: (code) => {
      if (!ctx.editor) return;
      ctx.editor.setValue(code);
      syncLayoutSelectFromCode();
    },
  });
  scheduleRender = previewApi.scheduleRender;
  initNameDialog();
  initFolderDialog();
  initTagsDialog();
  initLoginDialog();
  initAiDialog();
  initAssetsPanel();
  initConsoleLogPanel();
  initStatusLog();
  initToolbarDocEdit({ showStatus });
  ctx.closeLoginDialog = closeLoginDialog;
  ctx.closeAiDialog = closeAiDialog;
  ctx.closeAssetsPanel = closeAssetsPanel;
  ctx.closeConsoleLogPanel = closeConsoleLogPanel;
  authApi = initAuthUI({ showStatus, escapeHtml });
  ctx.authUI = authApi;
  settingsApi = initSettingsUI({
    updateSaveHelpContent: authApi.updateSaveHelpContent,
    escapeHtml,
  });
  ctx.settingsUI = settingsApi;
  ctx.closeSettingsPanel = settingsApi.closeSettingsPanel;
  shareApi = initShareUI({ showStatus });
  ctx.shareUI = shareApi;
  diagramApi = initDiagrams({
    showStatus,
    clearPersistentStatus,
    escapeHtml,
    scheduleRender: previewApi.scheduleRender,
    renderPreviewNow: previewApi.renderPreviewNow,
    waitForPreviewSettled: previewApi.waitForPreviewSettled,
    clearPreviewCanvas: previewApi.clearPreviewCanvas,
    syncLayoutSelectFromCode,
    setQueryDiagram,
    updateSaveHelpContent: authApi.updateSaveHelpContent,
    updateToolbarDocInfo,
  });
  scheduleAutoSave = diagramApi.scheduleAutoSave;
  markContentDirty = diagramApi.markContentDirty;

  window.addEventListener('odogram:preview-resize', () => {
    if (previewApi.getPreviewSvg()) previewApi.fitPreview();
  });

  ctx.layoutUI = initLayoutUI({
    closeOtherPopovers: () => {
      authApi.setUserMenuOpen(false);
      settingsApi.setSettingsOpen(false);
      shareApi.setShareOpen(false);
      closeLoginDialog();
      closeAiDialog();
      closeAssetsPanel();
      closeConsoleLogPanel();
    },
  });
  bindToolbar();

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    showStatus(`Login failed (${error})`, true);
    params.delete('error');
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

  ctx.user = await authApi.fetchMe();
  authApi.updateAuthUI();

  const { id: queryId, folder: queryFolder } = getQueryDiagram();
  if (ctx.user?.login) {
    const listPromise = diagramApi.loadDiagramList();
    if (queryId) {
      await diagramApi.loadDiagram(queryId, queryFolder);
    } else {
      try {
        await diagramApi.loadWelcome();
      } catch (err) {
        showStatus(err.message || 'Failed to load product map', true);
      }
    }
    await listPromise;
  } else {
    diagramApi.loadGuestExampleList();
    try {
      await diagramApi.loadWelcome();
    } catch (err) {
      showStatus(err.message || 'Failed to load product map', true);
    }
  }

  authApi.updateSaveHelpContent();
}

init();
