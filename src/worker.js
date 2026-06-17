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
  listDiagrams,
  loadDiagram,
  renameDiagram,
  saveDiagram,
} from './github.js';

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

function viewPageHtml({ username, id, code, origin, nonce }) {
  const safeUser = escapeHtml(username);
  const safeId = escapeHtml(id);
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
    <span class="meta">${safeUser} / ${safeId}</span>
    <a href="${escapeHtml(getShareUrl(origin, username, id))}">Share</a>
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
  </script>
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

  const { code } = body;
  let { id } = body;

  if (!code || typeof code !== 'string') {
    return Response.json({ error: 'Missing code' }, { status: 400 });
  }

  if (!id) {
    id = randomDiagramId();
  }

  if (!ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id format' }, { status: 400 });
  }

  try {
    await saveDiagram(session.token, session.username, id, code);
    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      id,
      shareUrl: getShareUrl(origin, session.username, id),
      githubUrl: getGitHubFileUrl(session.username, id),
    });
  } catch (err) {
    return Response.json({ error: err.message || 'Save failed' }, { status: 500 });
  }
}

async function handleLoad(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const code = await loadDiagram(session.token, session.username, id);
    if (code === null) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ id, code });
  } catch (err) {
    return Response.json({ error: err.message || 'Load failed' }, { status: 500 });
  }
}

async function handleList(request, env, session) {
  const denied = requireSession(session);
  if (denied) return denied;

  try {
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

  const { oldId, newId } = body;

  if (!oldId || !newId || typeof oldId !== 'string' || typeof newId !== 'string') {
    return Response.json({ error: 'Invalid id format' }, { status: 400 });
  }

  if (!ID_PATTERN.test(oldId) || !ID_PATTERN.test(newId)) {
    return Response.json({ error: 'Invalid id format' }, { status: 400 });
  }

  if (oldId === newId) {
    return Response.json({ error: 'No change' }, { status: 400 });
  }

  try {
    await renameDiagram(session.token, session.username, oldId, newId);
    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      id: newId,
      shareUrl: getShareUrl(origin, session.username, newId),
      githubUrl: getGitHubFileUrl(session.username, newId),
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

  const { id } = body;

  if (!id || typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    await deleteDiagram(session.token, session.username, id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err.message || 'Delete failed';
    if (message === 'Not found') {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleView(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /view/:username/:id
  if (parts.length !== 3 || parts[0] !== 'view') {
    return new Response('Not found', { status: 404 });
  }

  const username = decodeURIComponent(parts[1]);
  const id = decodeURIComponent(parts[2]);

  if (!ID_PATTERN.test(id) || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return new Response('Invalid path', { status: 400 });
  }

  try {
    const code = await fetchPublicDiagram(username, id);
    if (code === null) {
      return new Response('Diagram not found', { status: 404 });
    }

    const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const html = viewPageHtml({
      username,
      id,
      code,
      origin: url.origin,
      nonce,
    });

    const csp = [
      "default-src 'self'",
      `script-src 'self' https://cdn.jsdelivr.net 'nonce-${nonce}'`,
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
      return handleMe(request, env);
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

    if (pathname.startsWith('/view/') && request.method === 'GET') {
      return handleView(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
