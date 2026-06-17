import { ctx } from './app-context.js';

const shareUrlEl = document.getElementById('share-url');
const sidebar = document.getElementById('sidebar');
const btnSave = document.getElementById('btn-save');
const btnSaveHelp = document.getElementById('btn-save-help');
const saveHelpPopover = document.getElementById('save-help-popover');
const saveHelpContent = document.getElementById('save-help-content');
const btnLogin = document.getElementById('btn-login');
const userMenu = document.getElementById('user-menu');
const btnUserToggle = document.getElementById('btn-user-toggle');
const userMenuPopover = document.getElementById('user-menu-popover');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

let saveHelpOpen = false;
let userMenuOpen = false;
let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;

function getGitHubPath(username, id, folder = '') {
  const base = `github.com/${username}/odogram-diagrams/diagrams/`;
  if (!id) return `${base}{folder}/{id}.mmd`;
  const rel = folder ? `${folder}/${id}.mmd` : `${id}.mmd`;
  return `${base}${rel}`;
}

export function getGitHubFileUrl(username, id, folder = '') {
  const rel = folder
    ? `${encodeURIComponent(folder)}/${encodeURIComponent(id)}.mmd`
    : `${encodeURIComponent(id)}.mmd`;
  return `https://github.com/${username}/odogram-diagrams/blob/main/diagrams/${rel}`;
}

export async function fetchMe() {
  const res = await fetch('/auth/me');
  return res.json();
}

export function updateSaveHelpContent() {
  let html = '';

  if (!ctx.user?.login) {
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">请先 Login with GitHub。登录后编辑内容会自动保存到你自己的仓库，odogram 不存储 diagram 内容。</p>
      <code class="save-help-path">github.com/{你的用户名}/odogram-diagrams/diagrams/{id}.mmd</code>
    `;
  } else if (ctx.currentId) {
    const path = getGitHubPath(ctx.user.username, ctx.currentId, ctx.currentFolder);
    const githubUrl = ctx.lastGithubUrl || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder);
    const shareUrl = ctx.lastShareUrl || (
      ctx.currentFolder
        ? `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(ctx.currentFolder)}/${encodeURIComponent(ctx.currentId)}`
        : `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(ctx.currentId)}`
    );
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">编辑后自动保存到此路径。</p>
      <code class="save-help-path">${escapeHtmlFn(path)}</code>
      <div class="save-help-actions">
        <a href="${escapeHtmlFn(githubUrl)}" target="_blank" rel="noopener noreferrer">在 GitHub 打开</a>
        <button type="button" data-copy-path="${escapeHtmlFn(path)}">复制路径</button>
        <a href="${escapeHtmlFn(shareUrl)}" target="_blank" rel="noopener noreferrer">分享链接</a>
      </div>
    `;
  } else {
    const path = getGitHubPath(ctx.user.username, null);
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">编辑后自动保存到下方仓库。点 Save 可立即保存；首次保存会自动创建 <code>odogram-diagrams</code> 仓库。</p>
      <code class="save-help-path">${escapeHtmlFn(path)}</code>
    `;
  }

  saveHelpContent.innerHTML = html;

  const copyBtn = saveHelpContent.querySelector('[data-copy-path]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copyPath);
        showStatusFn('路径已复制');
      } catch {
        showStatusFn('复制失败', true);
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

export function toggleUserMenu(event) {
  event.stopPropagation();
  setUserMenuOpen(!userMenuOpen);
  if (userMenuOpen) setSaveHelpOpen(false);
}

export function setSaveHelpOpen(open) {
  saveHelpOpen = open;
  saveHelpPopover.hidden = !open;
  btnSaveHelp.classList.toggle('active', open);
  if (open) {
    updateSaveHelpContent();
    setUserMenuOpen(false);
  }
}

export function toggleSaveHelp(event) {
  event.stopPropagation();
  setSaveHelpOpen(!saveHelpOpen);
}

export function updateAuthUI() {
  document.body.classList.toggle('is-logged-in', !!ctx.user?.login);
  document.body.classList.toggle('is-logged-out', !ctx.user?.login);

  if (ctx.user?.login) {
    btnLogin.hidden = true;
    userMenu.hidden = false;
    btnSave.disabled = false;
    sidebar.classList.add('visible');
    userAvatar.src = ctx.user.avatar;
    userAvatar.alt = ctx.user.username;
    userName.textContent = ctx.user.username;
  } else {
    btnLogin.hidden = false;
    userMenu.hidden = true;
    btnSave.disabled = true;
    sidebar.classList.remove('visible');
    setSaveHelpOpen(false);
    setUserMenuOpen(false);
  }
  ctx.layoutUI?.syncSidebarToggle();
  updateSaveHelpContent();
}

export function initAuthUI({ showStatus, escapeHtml }) {
  showStatusFn = showStatus;
  escapeHtmlFn = escapeHtml;

  btnSaveHelp.addEventListener('click', toggleSaveHelp);
  saveHelpPopover.addEventListener('click', (event) => event.stopPropagation());
  userMenuPopover.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
    if (saveHelpOpen) setSaveHelpOpen(false);
    if (userMenuOpen) setUserMenuOpen(false);
  });

  return {
    fetchMe,
    updateAuthUI,
    updateSaveHelpContent,
    toggleUserMenu,
    setUserMenuOpen,
  };
}
