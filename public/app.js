import { cursorDarkTheme } from './theme.js';

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const statusEl = document.getElementById('status');
const shareUrlEl = document.getElementById('share-url');
const sidebar = document.getElementById('sidebar');
const diagramList = document.getElementById('diagram-list');
const btnSave = document.getElementById('btn-save');
const btnSaveHelp = document.getElementById('btn-save-help');
const saveHelpPopover = document.getElementById('save-help-popover');
const saveHelpContent = document.getElementById('save-help-content');
const btnCopy = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');
const btnExample = document.getElementById('btn-example');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

let currentId = null;
let lastShareUrl = '';
let lastGithubUrl = '';
let saveHelpOpen = false;
let lastSvg = '';
let renderTimer = null;
let renderSeq = 0;
let user = null;

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

async function renderPreview() {
  const code = editor.value.trim();
  const seq = ++renderSeq;

  if (!code) {
    preview.innerHTML = '';
    lastSvg = '';
    return;
  }

  const renderId = `diagram-${Date.now()}-${seq}`;
  try {
    const { svg } = await mermaid.render(renderId, code);
    if (seq !== renderSeq) return;
    preview.innerHTML = svg;
    lastSvg = svg;
  } catch (err) {
    if (seq !== renderSeq) return;
    preview.innerHTML = `<div class="preview-error">${escapeHtml(String(err.message || err))}</div>`;
    lastSvg = '';
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

function setSaveHelpOpen(open) {
  saveHelpOpen = open;
  saveHelpPopover.hidden = !open;
  btnSaveHelp.classList.toggle('active', open);
  if (open) updateSaveHelpContent();
}

function toggleSaveHelp(event) {
  event.stopPropagation();
  setSaveHelpOpen(!saveHelpOpen);
}

function updateAuthUI() {
  if (user?.login) {
    btnLogin.hidden = true;
    userInfo.hidden = false;
    btnSave.disabled = false;
    sidebar.classList.add('visible');
    userAvatar.src = user.avatar;
    userAvatar.alt = user.username;
    userName.textContent = user.username;
  } else {
    btnLogin.hidden = false;
    userInfo.hidden = true;
    btnSave.disabled = true;
    sidebar.classList.remove('visible');
    setSaveHelpOpen(false);
  }
  updateSaveHelpContent();
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
    const btn = document.createElement('button');
    btn.textContent = item.id;
    btn.classList.toggle('active', item.id === currentId);
    btn.addEventListener('click', () => loadDiagram(item.id));
    li.appendChild(btn);
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
  editor.value = data.code;
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
        code: editor.value,
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
    editor.value = await res.text();
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
    await navigator.clipboard.writeText(editor.value);
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

editor.addEventListener('input', scheduleRender);
btnSave.addEventListener('click', saveDiagram);
btnSaveHelp.addEventListener('click', toggleSaveHelp);
saveHelpPopover.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => {
  if (saveHelpOpen) setSaveHelpOpen(false);
});
btnCopy.addEventListener('click', copySource);
btnDownload.addEventListener('click', downloadSvg);
btnExample.addEventListener('click', loadExample);
btnLogin.addEventListener('click', () => {
  window.location.href = '/auth/login';
});
btnLogout.addEventListener('click', () => {
  window.location.href = '/auth/logout';
});

async function init() {
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
