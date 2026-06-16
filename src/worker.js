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
  fetchPublicDiagram,
  getGitHubFileUrl,
  getShareUrl,
  listDiagrams,
  loadDiagram,
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

function viewPageHtml({ username, id, code, origin }) {
  const safeUser = escapeHtml(username);
  const safeId = escapeHtml(id);
  const codeJson = JSON.stringify(code).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeId} — odogram</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
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
  <script>
    mermaid.initialize({
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

    (async function () {
      const preview = document.getElementById('preview');
      const code = JSON.parse(document.getElementById('diagram-data').textContent);
      const renderId = 'view-diagram-' + Date.now();
      try {
        const { svg } = await mermaid.render(renderId, code);
        preview.innerHTML = svg;
      } catch (err) {
        preview.innerHTML = '<div class="error">' + String(err.message || err) + '</div>';
      }
    })();
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
    id = crypto.randomUUID().slice(0, 8);
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

    const html = viewPageHtml({
      username,
      id,
      code,
      origin: url.origin,
    });

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    return new Response(err.message || 'Failed to load diagram', { status: 500 });
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
      return handleLogout(request);
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

    if (pathname.startsWith('/view/') && request.method === 'GET') {
      return handleView(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
