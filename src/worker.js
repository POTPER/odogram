import {
  ELK_LAYOUT_INTEGRITY,
  ELK_LAYOUT_URL,
  MERMAID_CDN_INTEGRITY,
  MERMAID_CDN_URL,
} from './cdn-integrity.js';
import {
  getSession,
  handleCallback,
  handleLogin,
  handleLogout,
  handleMe,
  ID_PATTERN,
  requireSession,
} from './auth.js';
import {
  deleteDiagram,
  fetchPublicDiagram,
  getGitHubFileUrl,
  getShareUrl,
  GitHubError,
  listDiagrams,
  loadDiagramDetail,
  moveDiagram,
  normalizeFolder,
  renameDiagram,
  saveDiagram,
} from './github.js';
import { migrateIfNeeded } from './migrate.js';
import { parseFrontmatter } from './frontmatter.js';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toBase64Url(bytes) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomDiagramId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseFolderParam(folder) {
  if (folder === null || folder === undefined || folder === '') {
    return { folder: '' };
  }
  if (typeof folder !== 'string' || !ID_PATTERN.test(folder)) {
    return { error: 'Invalid folder format' };
  }
  return { folder };
}

function viewPageHtml({ username, id, folder, code, origin, nonce }) {
  const safeUser = escapeHtml(username);
  const safeId = escapeHtml(id);
  const safeFolder = folder ? escapeHtml(folder) : '';
  const displayPath = folder ? `${safeFolder} / ${safeId}` : safeId;
  const codeJson = JSON.stringify(code).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeId} — odogram</title>
  <script type="importmap" nonce="${nonce}">
  {
    "imports": {
      "mermaid": "${MERMAID_CDN_URL}",
      "elk-layouts": "${ELK_LAYOUT_URL}"
    },
    "integrity": {
      "${MERMAID_CDN_URL}": "${MERMAID_CDN_INTEGRITY}",
      "${ELK_LAYOUT_URL}": "${ELK_LAYOUT_INTEGRITY}"
    }
  }
  </script>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #1e1e1e;
      color: #cccccc;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
    }
    header a {
      color: #007acc;
      text-decoration: none;
    }
    header a:hover { text-decoration: underline; }
    .meta { color: #858585; font-size: 13px; }
    #preview {
      padding: 32px;
      display: flex;
      justify-content: center;
      overflow: auto;
    }
    #preview svg { max-width: 100%; height: auto; }
    .error { color: #f48771; padding: 24px; font-family: monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header>
    <a href="/">odogram</a>
    <span class="meta">${safeUser} / ${displayPath}</span>
    <a href="${escapeHtml(getShareUrl(origin, username, id, folder))}">Share</a>
  </header>
  <div id="preview"></div>
  <script id="diagram-data" type="application/json">${codeJson}</script>
  <script type="module" nonce="${nonce}" crossorigin="anonymous">
    import mermaid from 'mermaid';
    import elkLayouts from 'elk-layouts';

    mermaid.registerLayoutLoaders(elkLayouts);
    mermaid.initialize({
      securityLevel: 'strict',
      theme: 'base',
      startOnLoad: false,
      themeVariables: {
        darkMode: true,
        background: '#1e1e1e',
        primaryColor: '#2d2d2d',
        primaryTextColor: '#cccccc',
        primaryBorderColor: '#007acc',
        lineColor: '#cccccc',
        textColor: '#cccccc',
        mainBkg: '#2d2d2d',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
      },
    });

    const preview = document.getElementById('preview');
    const code = JSON.parse(document.getElementById('diagram-data').textContent);
    const renderId = 'view-diagram-' + Date.now();

    try {
      const { svg } = await mermaid.render(renderId, code);
      preview.innerHTML = svg;
    } catch (err) {
      preview.innerHTML = '<div class="error">Failed to render diagram</div>';
    }

    document.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    }, { capture: true });
  </script>
</body>
</html>`;
}

function viewOproductPageHtml({ username, id, folder, code, origin, nonce }) {
  const safeUser = escapeHtml(username);
  const safeId = escapeHtml(id);
  const safeFolder = folder ? escapeHtml(folder) : '';
  const displayPath = folder ? `${safeFolder} / ${safeId}` : safeId;
  const codeJson = JSON.stringify(code).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeId} — odogram</title>
  <link rel="stylesheet" href="/style.css">
  <style nonce="${nonce}">
    body { margin: 0; min-height: 100vh; background: #1e1e1e; color: #cccccc; font-family: 'Segoe UI', system-ui, sans-serif; }
    header {
      display: flex; align-items: center; gap: 12px; padding: 10px 16px;
      background: #252526; border-bottom: 1px solid #3c3c3c;
    }
    header a { color: #007acc; text-decoration: none; }
    header a:hover { text-decoration: underline; }
    .meta { color: #858585; font-size: 13px; }
    .oproduct-readonly-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; background: #252526; border-bottom: 1px solid #3c3c3c;
    }
    #preview { flex: 1; overflow: auto; padding: 16px; }
    #preview-canvas { position: relative; inset: auto; min-height: 100%; }
  </style>
</head>
<body>
  <header>
    <a href="/">odogram</a>
    <span class="meta">${safeUser} / ${displayPath}</span>
    <a href="${escapeHtml(getShareUrl(origin, username, id, folder))}">Share</a>
  </header>
  <div class="oproduct-readonly-bar">
    <span class="meta">Product view</span>
    <div id="oproduct-view-toolbar" class="oproduct-view-switch" role="group" aria-label="Product view">
      <button type="button" class="mode-btn active" data-oproduct-view="tree" aria-pressed="true">Tree</button>
      <button type="button" class="mode-btn" data-oproduct-view="roadmap" aria-pressed="false">Roadmap</button>
      <button type="button" class="mode-btn" data-oproduct-view="journey" aria-pressed="false">Journey</button>
    </div>
  </div>
  <div id="preview"><div id="preview-canvas"></div></div>
  <script id="diagram-data" type="application/json">${codeJson}</script>
  <script type="module" src="/view-oproduct.js" nonce="${nonce}" crossorigin="anonymous"></script>
</body>
</html>`;
}

async function handleSave(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, expectedUpdatedAt } = body;
  let { id, folder } = body;

  if (!code || typeof code !== 'string') {
    return Response.json({ error: 'Missing code' }, { status: 400 });
  }

  const folderResult = parseFolderParam(folder);
  if (folderResult.error) {
    return Response.json({ error: folderResult.error }, { status: 400 });
  }
  folder = folderResult.folder;

  if (!id) {
    id = randomDiagramId();
  }

  if (!ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id format' }, { status: 400 });
  }

  try {
    const saved = await saveDiagram(
      session.token,
      session.username,
      id,
      code,
      folder,
      expectedUpdatedAt,
    );
    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      id: saved.id,
      folder: saved.folder,
      number: saved.number,
      updatedAt: saved.updatedAt,
      shareUrl: getShareUrl(origin, session.username, saved.id, saved.folder),
      githubUrl: getGitHubFileUrl(session.username, saved.id, saved.folder, saved.number),
    });
  } catch (err) {
    if (err instanceof GitHubError && err.status === 409) {
      return Response.json({ error: 'Conflict: diagram was modified elsewhere' }, { status: 409 });
    }
    return Response.json({ error: err.message || 'Save failed' }, { status: 500 });
  }
}

async function handleLoad(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const folderParam = url.searchParams.get('folder');
  const folderResult = parseFolderParam(folderParam ?? '');
  if (folderResult.error) {
    return Response.json({ error: folderResult.error }, { status: 400 });
  }

  if (!id || !ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const detail = await loadDiagramDetail(session.token, session.username, id, folderResult.folder);
    if (!detail) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const origin = new URL(request.url).origin;
    return Response.json({
      id: detail.id,
      folder: detail.folder,
      code: detail.code,
      number: detail.number,
      updatedAt: detail.updatedAt,
      shareUrl: getShareUrl(origin, session.username, detail.id, detail.folder),
      githubUrl: getGitHubFileUrl(session.username, detail.id, detail.folder, detail.number),
    });
  } catch (err) {
    return Response.json({ error: err.message || 'Load failed' }, { status: 500 });
  }
}

async function handleList(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  try {
    await migrateIfNeeded(session, env.SESSIONS);
    const diagrams = await listDiagrams(session.token, session.username);
    return Response.json({ diagrams });
  } catch (err) {
    return Response.json({ error: err.message || 'List failed' }, { status: 500 });
  }
}

async function handleRename(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { oldId, newId, folder } = body;

  if (!oldId || !newId || typeof oldId !== 'string' || typeof newId !== 'string') {
    return Response.json({ error: 'Invalid id format' }, { status: 400 });
  }

  const folderResult = parseFolderParam(folder ?? '');
  if (folderResult.error) {
    return Response.json({ error: folderResult.error }, { status: 400 });
  }

  if (!ID_PATTERN.test(oldId) || !ID_PATTERN.test(newId)) {
    return Response.json({ error: 'Invalid id format' }, { status: 400 });
  }

  if (oldId === newId) {
    return Response.json({ error: 'No change' }, { status: 400 });
  }

  try {
    const renamed = await renameDiagram(
      session.token,
      session.username,
      oldId,
      newId,
      folderResult.folder,
    );
    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      id: renamed.id,
      folder: renamed.folder,
      number: renamed.number,
      updatedAt: renamed.updatedAt,
      shareUrl: getShareUrl(origin, session.username, renamed.id, renamed.folder),
      githubUrl: getGitHubFileUrl(session.username, renamed.id, renamed.folder, renamed.number),
    });
  } catch (err) {
    const message = err.message || 'Rename failed';
    if (message === 'Diagram id already exists') {
      return Response.json({ error: message }, { status: 409 });
    }
    if (message === 'Not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleDelete(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, folder } = body;

  if (!id || typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const folderResult = parseFolderParam(folder ?? '');
  if (folderResult.error) {
    return Response.json({ error: folderResult.error }, { status: 400 });
  }

  try {
    await deleteDiagram(session.token, session.username, id, folderResult.folder);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err.message || 'Delete failed';
    if (message === 'Not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleMove(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, fromFolder, toFolder } = body;

  if (!id || typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const fromResult = parseFolderParam(fromFolder ?? '');
  if (fromResult.error) {
    return Response.json({ error: fromResult.error }, { status: 400 });
  }

  const toResult = parseFolderParam(toFolder ?? '');
  if (toResult.error) {
    return Response.json({ error: toResult.error }, { status: 400 });
  }

  try {
    const moved = await moveDiagram(
      session.token,
      session.username,
      id,
      fromResult.folder,
      toResult.folder,
    );
    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      id: moved.id,
      folder: moved.folder,
      number: moved.number,
      updatedAt: moved.updatedAt,
      shareUrl: getShareUrl(origin, session.username, moved.id, moved.folder),
      githubUrl: getGitHubFileUrl(session.username, moved.id, moved.folder, moved.number),
    });
  } catch (err) {
    const message = err.message || 'Move failed';
    if (message === 'Diagram id already exists') {
      return Response.json({ error: message }, { status: 409 });
    }
    if (message === 'Not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    if (message === 'No change') {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleView(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /view/:username/:id  or  /view/:username/:folder/:id
  if (parts.length < 3 || parts[0] !== 'view') {
    return new Response('Not found', { status: 404 });
  }

  const username = decodeURIComponent(parts[1]);
  let folder = '';
  let id;

  if (parts.length === 3) {
    id = decodeURIComponent(parts[2]);
  } else if (parts.length === 4) {
    folder = decodeURIComponent(parts[2]);
    id = decodeURIComponent(parts[3]);
  } else {
    return new Response('Not found', { status: 404 });
  }

  if (!ID_PATTERN.test(id) || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return new Response('Invalid path', { status: 400 });
  }

  if (folder && !ID_PATTERN.test(folder)) {
    return new Response('Invalid path', { status: 400 });
  }

  try {
    const code = await fetchPublicDiagram(username, id, folder);
    if (code === null) {
      return new Response('Diagram not found', { status: 404 });
    }

    const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const meta = parseFrontmatter(code);
    const pageArgs = {
      username,
      id,
      folder: normalizeFolder(folder),
      code,
      origin: url.origin,
      nonce,
    };
    const html = meta.format === 'oproduct'
      ? viewOproductPageHtml(pageArgs)
      : viewPageHtml(pageArgs);

    const csp = [
      "default-src 'self'",
      meta.format === 'oproduct'
        ? `script-src 'self' 'nonce-${nonce}'`
        : `script-src 'self' https://cdn.jsdelivr.net 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
      },
    });
  } catch (err) {
    console.error('handleView failed:', err);
    return new Response('Failed to load diagram', { status: 500 });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/auth/login' && request.method === 'GET') {
      return handleLogin(request, env);
    }

    if (pathname === '/auth/callback' && request.method === 'GET') {
      return handleCallback(request, env);
    }

    if (pathname === '/auth/logout' && request.method === 'GET') {
      return handleLogout(request, env);
    }

    if (pathname === '/auth/me' && request.method === 'GET') {
      const meSession = await getSession(request, env);
      const meResponse = await handleMe(request, env);
      if (meSession) {
        try {
          await migrateIfNeeded(meSession, env.SESSIONS);
        } catch (err) {
          console.error('migrateIfNeeded failed:', err);
        }
      }
      return meResponse;
    }

    const session = await getSession(request, env);

    if (pathname === '/api/save' && request.method === 'POST') {
      return handleSave(request, env, session);
    }

    if (pathname === '/api/load' && request.method === 'GET') {
      return handleLoad(request, env, session);
    }

    if (pathname === '/api/list' && request.method === 'GET') {
      return handleList(request, env, session);
    }

    if (pathname === '/api/rename' && request.method === 'POST') {
      return handleRename(request, env, session);
    }

    if (pathname === '/api/delete' && request.method === 'POST') {
      return handleDelete(request, env, session);
    }

    if (pathname === '/api/move' && request.method === 'POST') {
      return handleMove(request, env, session);
    }

    if (pathname.startsWith('/view/') && request.method === 'GET') {
      return handleView(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
