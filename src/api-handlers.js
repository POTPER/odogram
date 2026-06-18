import { ID_PATTERN, requireSession } from './auth.js';
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
import {
  buildViewCsp,
  toBase64Url,
  viewOproductPageHtml,
  viewPageHtml,
} from './view-pages.js';

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

export async function handleSave(request, env, session) {
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

export async function handleLoad(request, env, session) {
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

export async function handleList(request, env, session) {
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

export async function handleRename(request, env, session) {
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

export async function handleDelete(request, env, session) {
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

export async function handleMove(request, env, session) {
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

export async function handleView(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
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

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': buildViewCsp(nonce, meta.format),
      },
    });
  } catch (err) {
    console.error('handleView failed:', err);
    return new Response('Failed to load diagram', { status: 500 });
  }
}
