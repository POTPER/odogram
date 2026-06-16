import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
import elkLayouts from '/vendor/layout-elk/mermaid-layout-elk.esm.min.mjs';
import { cursorDarkTheme } from './theme.js';
import { createMermaidEditor } from './editor.js';
import { applyLayoutFrontmatter, LAYOUT_MODES, parseLayoutFromCode } from './layout.js';
import { initLayoutUI } from './layout-ui.js';

mermaid.registerLayoutLoaders(elkLayouts);

const editorRoot = document.getElementById('editor-root');
const preview = document.getElementById('preview');
const previewCanvas = document.getElementById('preview-canvas');
const zoomLabel = document.getElementById('zoom-label');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const statusEl = document.getElementById('status');
const shareUrlEl = document.getElementById('share-url');
const sidebar = document.getElementById('sidebar');
const diagramList = document.getElementById('diagram-list');
const btnSave = document.getElementById('btn-save');
const btnSaveHelp = document.getElementById('btn-save-help');
const saveHelpPopover = document.getElementById('save-help-popover');
const saveHelpContent = document.getElementById('save-help-content');
const btnCopy = document.getElementById('btn-copy');
const layoutSelect = document.getElementById('layout-select');
const btnDownload = document.getElementById('btn-download');
const btnExample = document.getElementById('btn-example');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userMenu = document.getElementById('user-menu');
const btnUserToggle = document.getElementById('btn-user-toggle');
const userMenuPopover = document.getElementById('user-menu-popover');
const btnMenuDiagrams = document.getElementById('btn-menu-diagrams');
const btnNewDiagram = document.getElementById('btn-new-diagram');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

let currentId = null;
let lastShareUrl = '';
let lastGithubUrl = '';
let saveHelpOpen = false;
let userMenuOpen = false;
let lastSvg = '';
let renderTimer = null;
let renderSeq = 0;
let user = null;
let editor = null;
let layoutSyncing = false;
let layoutUI = null;

const PREVIEW_PADDING = 24;
const PREVIEW_MIN_SCALE = 0.1;
const PREVIEW_MAX_SCALE = 5;
const ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

let previewScale = 1;
let previewPanX = 0;
let previewPanY = 0;
let previewPanning = false;
let previewLastPointer = { x: 0, y: 0 };
let previewPinchDistance = 0;

mermaid.initialize({
  ...cursorDarkTheme,
  startOnLoad: false,
});

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.add('visible');
  statusEl.classList.toggle('error', isError);
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusEl.classList.remove('visible', 'error');
  }, 4000);
}

function syncLayoutSelectFromCode() {
  if (!editor || !layoutSelect) return;
  layoutSyncing = true;
  layoutSelect.value = parseLayoutFromCode(editor.getValue());
  layoutSyncing = false;
}

function handleLayoutChange() {
  if (layoutSyncing || !editor) return;

  const layout = layoutSelect.value;
  const code = applyLayoutFrontmatter(editor.getValue(), layout);
  editor.setValue(code);
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

function getPreviewSvg() {
  return previewCanvas.querySelector('svg');
}

function setPreviewInteractionsEnabled(enabled) {
  btnZoomIn.disabled = !enabled;
  btnZoomOut.disabled = !enabled;
  btnZoomFit.disabled = !enabled;
  btnZoomReset.disabled = !enabled;
  preview.classList.toggle('preview-disabled', !enabled);
}

function applyPreviewTransform() {
  previewCanvas.style.transform = `translate(${previewPanX}px, ${previewPanY}px) scale(${previewScale})`;
  updateZoomLabel();
}

function updateZoomLabel() {
  zoomLabel.textContent = `${Math.round(previewScale * 100)}%`;
}

function clampPreviewScale(scale) {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, scale));
}

function getSvgSize(svg) {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox?.width && viewBox?.height) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const width = parseFloat(svg.getAttribute('width'));
  const height = parseFloat(svg.getAttribute('height'));
  if (width && height) {
    return { width, height };
  }

  const bbox = svg.getBBox();
  return { width: bbox.width, height: bbox.height };
}

function fitPreview() {
  const svg = getPreviewSvg();
  if (!svg) return;

  const { width, height } = getSvgSize(svg);
  if (!width || !height) return;

  const viewportWidth = preview.clientWidth;
  const viewportHeight = preview.clientHeight;
  const availableWidth = Math.max(viewportWidth - PREVIEW_PADDING * 2, 1);
  const availableHeight = Math.max(viewportHeight - PREVIEW_PADDING * 2, 1);

  previewScale = clampPreviewScale(Math.min(availableWidth / width, availableHeight / height));
  previewPanX = (viewportWidth - width * previewScale) / 2;
  previewPanY = (viewportHeight - height * previewScale) / 2;
  applyPreviewTransform();
}

function resetPreviewView() {
  const svg = getPreviewSvg();
  if (!svg) return;

  const { width, height } = getSvgSize(svg);
  previewScale = 1;
  previewPanX = (preview.clientWidth - width) / 2;
  previewPanY = (preview.clientHeight - height) / 2;
  applyPreviewTransform();
}

function zoomPreviewBy(factor, anchorX, anchorY) {
  if (!getPreviewSvg()) return;

  const nextScale = clampPreviewScale(previewScale * factor);
  if (nextScale === previewScale) return;

  const worldX = (anchorX - previewPanX) / previewScale;
  const worldY = (anchorY - previewPanY) / previewScale;
  previewScale = nextScale;
  previewPanX = anchorX - worldX * previewScale;
  previewPanY = anchorY - worldY * previewScale;
  applyPreviewTransform();
}

function getPreviewPoint(clientX, clientY) {
  const rect = preview.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touches) {
  return getPreviewPoint(
    (touches[0].clientX + touches[1].clientX) / 2,
    (touches[0].clientY + touches[1].clientY) / 2,
  );
}

function initPreviewViewport() {
  btnZoomIn.addEventListener('click', () => {
    zoomPreviewBy(1.25, preview.clientWidth / 2, preview.clientHeight / 2);
  });

  btnZoomOut.addEventListener('click', () => {
    zoomPreviewBy(0.8, preview.clientWidth / 2, preview.clientHeight / 2);
  });

  btnZoomFit.addEventListener('click', fitPreview);
  btnZoomReset.addEventListener('click', resetPreviewView);

  preview.addEventListener('wheel', (event) => {
    if (!getPreviewSvg()) return;
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const point = getPreviewPoint(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomPreviewBy(factor, point.x, point.y);
  }, { passive: false });

  preview.addEventListener('pointerdown', (event) => {
    if (!getPreviewSvg() || event.button !== 0) return;

    previewPanning = true;
    previewLastPointer = { x: event.clientX, y: event.clientY };
    preview.classList.add('is-panning');
    preview.setPointerCapture(event.pointerId);
  });

  preview.addEventListener('pointermove', (event) => {
    if (!previewPanning) return;

    previewPanX += event.clientX - previewLastPointer.x;
    previewPanY += event.clientY - previewLastPointer.y;
    previewLastPointer = { x: event.clientX, y: event.clientY };
    applyPreviewTransform();
  });

  function stopPanning(event) {
    if (!previewPanning) return;
    previewPanning = false;
    preview.classList.remove('is-panning');
    if (preview.hasPointerCapture(event.pointerId)) {
      preview.releasePointerCapture(event.pointerId);
    }
  }

  preview.addEventListener('pointerup', stopPanning);
  preview.addEventListener('pointercancel', stopPanning);

  preview.addEventListener('touchstart', (event) => {
    if (!getPreviewSvg() || event.touches.length !== 2) return;

    previewPinchDistance = getTouchDistance(event.touches);
  }, { passive: true });

  preview.addEventListener('touchmove', (event) => {
    if (!getPreviewSvg() || event.touches.length !== 2 || !previewPinchDistance) return;

    event.preventDefault();
    const distance = getTouchDistance(event.touches);
    const center = getTouchCenter(event.touches);
    const factor = distance / previewPinchDistance;
    if (factor !== 1) {
      zoomPreviewBy(factor, center.x, center.y);
    }
    previewPinchDistance = distance;
  }, { passive: false });

  preview.addEventListener('touchend', (event) => {
    if (event.touches.length < 2) {
      previewPinchDistance = 0;
    }
  });
}

async function renderPreview() {
  const code = editor.getValue().trim();
  const seq = ++renderSeq;

  if (!code) {
    previewCanvas.innerHTML = '';
    lastSvg = '';
    previewScale = 1;
    previewPanX = 0;
    previewPanY = 0;
    applyPreviewTransform();
    setPreviewInteractionsEnabled(false);
    return;
  }

  const renderId = `diagram-${Date.now()}-${seq}`;
  try {
    const { svg } = await mermaid.render(renderId, code);
    if (seq !== renderSeq) return;
    previewCanvas.innerHTML = svg;
    lastSvg = svg;
    setPreviewInteractionsEnabled(true);
    fitPreview();
  } catch (err) {
    if (seq !== renderSeq) return;
    previewCanvas.innerHTML = `<div class="preview-error">${escapeHtml(String(err.message || err))}</div>`;
    lastSvg = '';
    setPreviewInteractionsEnabled(false);
    updateZoomLabel();
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 300);
}

async function fetchMe() {
  const res = await fetch('/auth/me');
  return res.json();
}

function getGitHubPath(username, id) {
  const base = `github.com/${username}/odogram-diagrams/diagrams/`;
  return id ? `${base}${id}.mmd` : `${base}{id}.mmd`;
}

function getGitHubFileUrl(username, id) {
  return `https://github.com/${username}/odogram-diagrams/blob/main/diagrams/${id}.mmd`;
}

function updateSaveHelpContent() {
  let html = '';

  if (!user?.login) {
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">请先 Login with GitHub。登录后点 Save，图表会保存到你自己的仓库，odogram 不存储 diagram 内容。</p>
      <code class="save-help-path">github.com/{你的用户名}/odogram-diagrams/diagrams/{id}.mmd</code>
    `;
  } else if (currentId) {
    const path = getGitHubPath(user.username, currentId);
    const githubUrl = lastGithubUrl || getGitHubFileUrl(user.username, currentId);
    const shareUrl = lastShareUrl || `${window.location.origin}/view/${encodeURIComponent(user.username)}/${encodeURIComponent(currentId)}`;
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <code class="save-help-path">${escapeHtml(path)}</code>
      <div class="save-help-actions">
        <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer">在 GitHub 打开</a>
        <button type="button" data-copy-path="${escapeHtml(path)}">复制路径</button>
        <a href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener noreferrer">分享链接</a>
      </div>
    `;
  } else {
    const path = getGitHubPath(user.username, null);
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">点 Save 后写入下方仓库。首次保存会自动创建 <code>odogram-diagrams</code> 仓库。</p>
      <code class="save-help-path">${escapeHtml(path)}</code>
    `;
  }

  saveHelpContent.innerHTML = html;

  const copyBtn = saveHelpContent.querySelector('[data-copy-path]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copyPath);
        showStatus('路径已复制');
      } catch {
        showStatus('复制失败', true);
      }
    });
  }
}

function setUserMenuOpen(open) {
  userMenuOpen = open;
  userMenuPopover.hidden = !open;
  btnUserToggle.classList.toggle('active', open);
  btnUserToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleUserMenu(event) {
  event.stopPropagation();
  setUserMenuOpen(!userMenuOpen);
  if (userMenuOpen) setSaveHelpOpen(false);
}

function setSaveHelpOpen(open) {
  saveHelpOpen = open;
  saveHelpPopover.hidden = !open;
  btnSaveHelp.classList.toggle('active', open);
  if (open) {
    updateSaveHelpContent();
    setUserMenuOpen(false);
  }
}

function toggleSaveHelp(event) {
  event.stopPropagation();
  setSaveHelpOpen(!saveHelpOpen);
}

function updateAuthUI() {
  document.body.classList.toggle('is-logged-in', !!user?.login);
  document.body.classList.toggle('is-logged-out', !user?.login);

  if (user?.login) {
    btnLogin.hidden = true;
    userMenu.hidden = false;
    btnSave.disabled = false;
    sidebar.classList.add('visible');
    userAvatar.src = user.avatar;
    userAvatar.alt = user.username;
    userName.textContent = user.username;
  } else {
    btnLogin.hidden = false;
    userMenu.hidden = true;
    btnSave.disabled = true;
    sidebar.classList.remove('visible');
    setSaveHelpOpen(false);
    setUserMenuOpen(false);
  }
  layoutUI?.syncSidebarToggle();
  updateSaveHelpContent();
}

function newDiagram() {
  editor.setValue('flowchart LR\n  A[New diagram] --> B[Edit me]');
  syncLayoutSelectFromCode();
  currentId = null;
  lastShareUrl = '';
  lastGithubUrl = '';
  setQueryId(null);
  shareUrlEl.textContent = '';
  scheduleRender();
  updateSaveHelpContent();
  diagramList.querySelectorAll('.diagram-item-btn').forEach((btn) => btn.classList.remove('active'));
  showStatus('New diagram');
}

let renameEditLi = null;

function cancelRenameEdit() {
  if (!renameEditLi) return;
  const oldId = renameEditLi.dataset.diagramId;
  const loadBtn = renameEditLi.querySelector('.diagram-item-btn');
  const renameBtn = renameEditLi.querySelector('.diagram-rename-btn');
  const input = renameEditLi.querySelector('.diagram-rename-input');
  if (input) {
    const label = document.createElement('span');
    label.className = 'diagram-item-label';
    label.textContent = oldId;
    input.replaceWith(label);
  }
  if (renameBtn) renameBtn.hidden = false;
  renameEditLi = null;
}

function startRenameEdit(li, oldId) {
  if (renameEditLi && renameEditLi !== li) cancelRenameEdit();

  const loadBtn = li.querySelector('.diagram-item-btn');
  const label = loadBtn.querySelector('.diagram-item-label');
  const renameBtn = li.querySelector('.diagram-rename-btn');
  if (!label || !renameBtn) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'diagram-rename-input';
  input.value = oldId;
  label.replaceWith(input);
  renameBtn.hidden = true;
  renameEditLi = li;
  li.dataset.diagramId = oldId;
  input.focus();
  input.select();

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      renameDiagram(oldId, input.value.trim());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRenameEdit();
    }
  });
}

async function renameDiagram(oldId, newId) {
  if (oldId === newId) {
    cancelRenameEdit();
    showStatus('No change', true);
    return;
  }

  if (!ID_PATTERN.test(newId)) {
    showStatus('Invalid id format', true);
    return;
  }

  try {
    const res = await fetch('/api/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldId, newId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Rename failed');
    }

    renameEditLi = null;

    if (oldId === currentId) {
      currentId = newId;
      setQueryId(newId);
      lastShareUrl = data.shareUrl || '';
      lastGithubUrl = data.githubUrl || getGitHubFileUrl(user.username, newId);
      shareUrlEl.textContent = lastShareUrl;
      shareUrlEl.title = lastShareUrl;
      updateSaveHelpContent();
    }

    await loadDiagramList();
    showStatus(`Renamed to ${newId}. Old share links no longer work.`);
  } catch (err) {
    showStatus(err.message || 'Rename failed', true);
  }
}

async function loadDiagramList() {
  if (!user?.login) return;

  const res = await fetch('/api/list');
  if (!res.ok) {
    showStatus('Failed to load diagram list', true);
    return;
  }

  const { diagrams } = await res.json();
  diagramList.innerHTML = '';

  for (const item of diagrams) {
    const li = document.createElement('li');
    li.className = 'diagram-list-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diagram-item-btn';
    btn.innerHTML = `<span class="diagram-item-icon" aria-hidden="true">◇</span><span class="diagram-item-label">${escapeHtml(item.id)}</span>`;
    btn.classList.toggle('active', item.id === currentId);
    btn.addEventListener('click', () => loadDiagram(item.id));

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'diagram-rename-btn';
    renameBtn.title = 'Rename';
    renameBtn.setAttribute('aria-label', 'Rename');
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      startRenameEdit(li, item.id);
    });

    li.appendChild(btn);
    li.appendChild(renameBtn);
    diagramList.appendChild(li);
  }
}

async function loadDiagram(id) {
  if (!user?.login) {
    showStatus('Login required to load saved diagrams', true);
    return;
  }

  const res = await fetch(`/api/load?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    showStatus('Failed to load diagram', true);
    return;
  }

  const data = await res.json();
  currentId = data.id;
  editor.setValue(data.code);
  syncLayoutSelectFromCode();
  setQueryId(currentId);
  lastShareUrl = `${window.location.origin}/view/${encodeURIComponent(user.username)}/${encodeURIComponent(currentId)}`;
  lastGithubUrl = getGitHubFileUrl(user.username, currentId);
  scheduleRender();
  await loadDiagramList();
  updateSaveHelpContent();
  showStatus(`Loaded ${currentId}`);
}

async function saveDiagram() {
  if (!user?.login) {
    showStatus('Login with GitHub to save', true);
    return;
  }

  btnSave.disabled = true;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentId || undefined,
        code: editor.getValue(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Save failed');
    }

    currentId = data.id;
    setQueryId(currentId);
    lastShareUrl = data.shareUrl || '';
    lastGithubUrl = data.githubUrl || getGitHubFileUrl(user.username, currentId);
    shareUrlEl.textContent = lastShareUrl;
    shareUrlEl.title = lastShareUrl;
    await loadDiagramList();
    updateSaveHelpContent();
    showStatus(`Saved to GitHub as ${currentId}`);
  } catch (err) {
    showStatus(err.message || 'Save failed', true);
  } finally {
    btnSave.disabled = false;
  }
}

async function loadExample() {
  try {
    const res = await fetch('/diagrams/example.mmd');
    if (!res.ok) throw new Error('Failed to load example');
    editor.setValue(await res.text());
    syncLayoutSelectFromCode();
    currentId = null;
    lastShareUrl = '';
    lastGithubUrl = '';
    setQueryId(null);
    shareUrlEl.textContent = '';
    scheduleRender();
    updateSaveHelpContent();
    showStatus('Example loaded');
  } catch (err) {
    showStatus(err.message || 'Failed to load example', true);
  }
}

async function copySource() {
  try {
    await navigator.clipboard.writeText(editor.getValue());
    showStatus('Source copied');
  } catch {
    showStatus('Copy failed', true);
  }
}

function downloadSvg() {
  if (!lastSvg) {
    showStatus('Nothing to download — fix preview errors first', true);
    return;
  }

  const blob = new Blob([lastSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentId || 'diagram'}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('SVG downloaded');
}

btnSave.addEventListener('click', saveDiagram);
btnSaveHelp.addEventListener('click', toggleSaveHelp);
saveHelpPopover.addEventListener('click', (event) => event.stopPropagation());
userMenuPopover.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => {
  if (saveHelpOpen) setSaveHelpOpen(false);
  if (userMenuOpen) setUserMenuOpen(false);
});
btnUserToggle.addEventListener('click', toggleUserMenu);
btnMenuDiagrams.addEventListener('click', () => {
  setUserMenuOpen(false);
  layoutUI?.openSidebar();
});
btnNewDiagram.addEventListener('click', newDiagram);
btnCopy.addEventListener('click', copySource);
layoutSelect.addEventListener('change', handleLayoutChange);
btnDownload.addEventListener('click', downloadSvg);
btnExample.addEventListener('click', loadExample);
btnLogin.addEventListener('click', () => {
  window.location.href = '/auth/login';
});
btnLogout.addEventListener('click', () => {
  window.location.href = '/auth/logout';
});

async function init() {
  editor = createMermaidEditor(editorRoot, { onChange: scheduleRender });
  layoutUI = initLayoutUI();
  initPreviewViewport();

  window.addEventListener('odogram:preview-resize', () => {
    if (getPreviewSvg()) fitPreview();
  });

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    showStatus(`Login failed (${error})`, true);
    params.delete('error');
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }

  user = await fetchMe();
  updateAuthUI();

  const queryId = getQueryId();
  if (queryId && user?.login) {
    await loadDiagram(queryId);
  } else {
    await loadExample();
  }

  if (user?.login) {
    await loadDiagramList();
  }

  updateSaveHelpContent();
}

init();
