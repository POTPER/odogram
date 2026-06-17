import mermaid from 'mermaid';
import elkLayouts from 'elk-layouts';
import { cursorDarkTheme } from './theme.js';
import { createMermaidEditor } from './editor.js';
import { applyLayoutFrontmatter, LAYOUT_MODES, parseLayoutFromCode } from './layout.js';
import { initLayoutUI } from './layout-ui.js';
import { ctx } from './app-context.js';
import { initPreview } from './preview.js';
import { initNameDialog } from './name-dialog.js';
import { initAuthUI } from './auth-ui.js';
import { initDiagrams } from './diagrams.js';

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({
  ...cursorDarkTheme,
  startOnLoad: false,
});

const editorRoot = document.getElementById('editor-root');
const statusEl = document.getElementById('status');
const layoutSelect = document.getElementById('layout-select');
const btnSave = document.getElementById('btn-save');
const btnCopy = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');
const btnExample = document.getElementById('btn-example');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const btnUserToggle = document.getElementById('btn-user-toggle');
const btnMenuDiagrams = document.getElementById('btn-menu-diagrams');
const btnNewDiagram = document.getElementById('btn-new-diagram');

let layoutSyncing = false;
let scheduleRender = () => {};
let previewApi;
let authApi;
let diagramApi;

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.add('visible');
  statusEl.classList.toggle('error', isError);
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusEl.classList.remove('visible', 'error');
  }, 4000);
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

function getQueryId() {
  return new URLSearchParams(window.location.search).get('id');
}

function setQueryId(id) {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set('id', id);
  } else {
    url.searchParams.delete('id');
  }
  window.history.replaceState({}, '', url);
}

function bindToolbar() {
  btnSave.addEventListener('click', () => diagramApi.saveDiagram());
  btnUserToggle.addEventListener('click', authApi.toggleUserMenu);
  btnMenuDiagrams.addEventListener('click', () => {
    authApi.setUserMenuOpen(false);
    ctx.layoutUI?.openSidebar();
  });
  btnNewDiagram.addEventListener('click', () => diagramApi.newDiagram());
  btnCopy.addEventListener('click', () => diagramApi.copySource());
  layoutSelect.addEventListener('change', handleLayoutChange);
  btnDownload.addEventListener('click', () => previewApi.downloadSvg());
  btnExample.addEventListener('click', () => diagramApi.loadExample());
  btnLogin.addEventListener('click', () => {
    window.location.href = '/auth/login';
  });
  btnLogout.addEventListener('click', () => {
    window.location.href = '/auth/logout';
  });
}

async function init() {
  try {
    ctx.editor = createMermaidEditor(editorRoot, { onChange: () => scheduleRender() });
  } catch (err) {
    console.error('Editor initialization failed:', err);
    showStatus('Editor failed to load — check console for details', true);
    return;
  }

  previewApi = initPreview({ showStatus, escapeHtml });
  scheduleRender = previewApi.scheduleRender;
  initNameDialog();
  authApi = initAuthUI({ showStatus, escapeHtml });
  diagramApi = initDiagrams({
    showStatus,
    escapeHtml,
    scheduleRender: previewApi.scheduleRender,
    syncLayoutSelectFromCode,
    setQueryId,
    updateSaveHelpContent: authApi.updateSaveHelpContent,
  });

  ctx.layoutUI = initLayoutUI();
  bindToolbar();

  window.addEventListener('odogram:preview-resize', () => {
    if (previewApi.getPreviewSvg()) previewApi.fitPreview();
  });

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    showStatus(`Login failed (${error})`, true);
    params.delete('error');
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

  ctx.user = await authApi.fetchMe();
  authApi.updateAuthUI();

  const queryId = getQueryId();
  if (queryId && ctx.user?.login) {
    await diagramApi.loadDiagram(queryId);
  } else {
    await diagramApi.loadExample();
  }

  if (ctx.user?.login) {
    await diagramApi.loadDiagramList();
  }

  authApi.updateSaveHelpContent();
}

init();
