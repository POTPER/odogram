import { ctx } from './app-context.js';
import { updateToolbarDocInfo } from './toolbar-doc.js';
import { updateToolbarDocRenameVisibility } from './toolbar-doc-edit.js';

const sidebar = document.getElementById('sidebar');
const sidebarTitle = document.getElementById('sidebar-title');
const btnDiagramsLabel = document.getElementById('btn-diagrams-label');
const btnNewDiagram = document.getElementById('btn-new-diagram');
const btnSave = document.getElementById('btn-save');
const saveHelpContent = document.getElementById('settings-save-info');
const btnLogin = document.getElementById('btn-login');
const userMenu = document.getElementById('user-menu');
const btnUserToggle = document.getElementById('btn-user-toggle');
const userMenuPopover = document.getElementById('user-menu-popover');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

let userMenuOpen = false;
let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;

function getGitHubPath(username, id, folder = '', number = null) {
  const base = `github.com/${username}/odogram-diagrams/issues/`;
  if (number) return `${base}${number}`;
  if (!id) return `${base}{number}`;
  return `${base}?q=${encodeURIComponent(folder ? `${folder}/${id}` : id)}`;
}

export function getGitHubFileUrl(username, id, folder = '', number = null) {
  if (number) {
    return `https://github.com/${username}/odogram-diagrams/issues/${number}`;
  }
  return `https://github.com/${username}/odogram-diagrams/issues`;
}

export async function fetchMe() {
  const res = await fetch('/auth/me');
  return res.json();
}

export function updateSaveHelpContent() {
  if (!saveHelpContent) return;

  let html = '';

  if (!ctx.user?.login) {
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">登录后图会存进<strong>你自己的</strong> GitHub Issue，不限 3 个项目；odogram 不存你的 diagram。打开网页粘贴 AI 或 mermaid.ai 的 Mermaid 即可用。</p>
      <code class="save-help-path">github.com/{你的用户名}/odogram-diagrams/issues/{number}</code>
    `;
  } else if (ctx.currentId) {
    const path = getGitHubPath(
      ctx.user.username,
      ctx.currentId,
      ctx.currentFolder,
      ctx.currentNumber,
    );
    const githubUrl = ctx.lastGithubUrl
      || getGitHubFileUrl(ctx.user.username, ctx.currentId, ctx.currentFolder, ctx.currentNumber);
    const shareUrl = ctx.lastShareUrl || (
      ctx.currentFolder
        ? `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(ctx.currentFolder)}/${encodeURIComponent(ctx.currentId)}`
        : `${window.location.origin}/view/${encodeURIComponent(ctx.user.username)}/${encodeURIComponent(ctx.currentId)}`
    );
    html = `
      <p><strong>保存位置（你的 GitHub）</strong></p>
      <p class="hint">编辑后自动保存为 GitHub Issue（标签 odogram:diagram）。</p>
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
      <p class="hint">编辑后自动保存到下方仓库的 Issue。点 Save 可立即保存；首次保存会自动创建 <code>odogram-diagrams</code> 仓库。</p>
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
  if (userMenuOpen) {
    ctx.settingsUI?.setSettingsOpen?.(false);
    ctx.layoutUI?.setViewLayoutOpen?.(false);
  }
}

export function updateAuthUI() {
  document.body.classList.toggle('is-logged-in', !!ctx.user?.login);
  document.body.classList.toggle('is-logged-out', !ctx.user?.login);

  if (ctx.user?.login) {
    btnLogin.hidden = true;
    userMenu.hidden = false;
    btnSave.disabled = false;
    sidebar.classList.add('drawer-ready');
    sidebar.classList.remove('visible');
    document.body.classList.remove('is-guest-examples');
    if (sidebarTitle) sidebarTitle.textContent = 'My Diagrams';
    if (btnDiagramsLabel) btnDiagramsLabel.textContent = 'Diagrams';
    if (btnNewDiagram) btnNewDiagram.hidden = false;
    userAvatar.src = ctx.user.avatar;
    userAvatar.alt = ctx.user.username;
    userName.textContent = ctx.user.username;
  } else {
    btnLogin.hidden = false;
    userMenu.hidden = true;
    btnSave.disabled = true;
    sidebar.classList.add('drawer-ready');
    sidebar.classList.remove('visible');
    document.body.classList.add('is-guest-examples');
    if (sidebarTitle) sidebarTitle.textContent = '示例';
    if (btnDiagramsLabel) btnDiagramsLabel.textContent = '示例';
    if (btnNewDiagram) btnNewDiagram.hidden = true;
    setUserMenuOpen(false);
    ctx.settingsUI?.setSettingsOpen?.(false);
  }
  ctx.layoutUI?.syncSidebarToggle();
  updateSaveHelpContent();
  ctx.settingsUI?.updateSettingsAccount?.();
  ctx.shareUI?.updateShareUI?.();
  updateToolbarDocInfo();
  updateToolbarDocRenameVisibility();
}

export function initAuthUI({ showStatus, escapeHtml }) {
  showStatusFn = showStatus;
  escapeHtmlFn = escapeHtml;

  userMenuPopover.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => {
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
