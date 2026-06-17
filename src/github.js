const REPO_NAME = 'odogram-diagrams';
const BRANCH = 'main';
const DIAGRAMS_DIR = 'diagrams';

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'odogram',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function normalizeFolder(folder) {
  if (!folder) return '';
  return folder;
}

export function filePath(folder, id) {
  const f = normalizeFolder(folder);
  if (f) {
    return `${DIAGRAMS_DIR}/${f}/${id}.mmd`;
  }
  return `${DIAGRAMS_DIR}/${id}.mmd`;
}

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function parseDiagramPath(path) {
  if (!path.startsWith(`${DIAGRAMS_DIR}/`) || !path.endsWith('.mmd')) {
    return null;
  }

  const relative = path.slice(`${DIAGRAMS_DIR}/`.length);
  const slash = relative.lastIndexOf('/');
  if (slash === -1) {
    return {
      folder: '',
      id: relative.replace(/\.mmd$/, ''),
    };
  }

  return {
    folder: relative.slice(0, slash),
    id: relative.slice(slash + 1).replace(/\.mmd$/, ''),
  };
}

export async function ensureRepo(token, username) {
  const res = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}`, {
    headers: githubHeaders(token),
  });

  if (res.status === 404) {
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: REPO_NAME,
        description: 'Mermaid diagrams created with odogram',
        private: false,
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create repo: ${createRes.status} ${err}`);
    }
    return;
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to check repo: ${res.status} ${err}`);
  }
}

async function getBranchTreeSha(token, username) {
  const refRes = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/git/ref/heads/${BRANCH}`,
    { headers: githubHeaders(token) },
  );

  if (refRes.status === 404) return null;
  if (!refRes.ok) {
    const err = await refRes.text();
    throw new Error(`Failed to get branch ref: ${refRes.status} ${err}`);
  }

  const ref = await refRes.json();
  const commitRes = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/git/commits/${ref.object.sha}`,
    { headers: githubHeaders(token) },
  );

  if (!commitRes.ok) {
    const err = await commitRes.text();
    throw new Error(`Failed to get commit: ${commitRes.status} ${err}`);
  }

  const commit = await commitRes.json();
  return commit.tree.sha;
}

async function getFileMeta(token, username, id, folder = '') {
  const path = filePath(folder, id);
  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${encodeRepoPath(path)}?ref=${BRANCH}`,
    { headers: githubHeaders(token) },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get file meta: ${res.status} ${err}`);
  }

  return res.json();
}

export async function saveDiagram(token, username, id, code, folder = '') {
  await ensureRepo(token, username);

  const path = filePath(folder, id);
  const existing = await getFileMeta(token, username, id, folder);

  const body = {
    message: existing ? `Update diagram ${folder ? `${folder}/` : ''}${id}` : `Add diagram ${folder ? `${folder}/` : ''}${id}`,
    content: btoa(unescape(encodeURIComponent(code))),
    branch: BRANCH,
  };

  if (existing?.sha) {
    body.sha = existing.sha;
  }

  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${encodeRepoPath(path)}`,
    {
      method: 'PUT',
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save diagram: ${res.status} ${err}`);
  }

  return res.json();
}

export async function loadDiagram(token, username, id, folder = '') {
  const meta = await getFileMeta(token, username, id, folder);
  if (!meta) return null;

  if (meta.content && meta.encoding === 'base64') {
    const binary = atob(meta.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (meta.download_url) {
    const res = await fetch(meta.download_url, {
      headers: { 'User-Agent': 'odogram' },
    });
    if (!res.ok) throw new Error(`Failed to download diagram: ${res.status}`);
    return res.text();
  }

  return null;
}

export async function deleteDiagram(token, username, id, folder = '') {
  const meta = await getFileMeta(token, username, id, folder);
  if (!meta) {
    throw new Error('Not found');
  }

  const path = filePath(folder, id);
  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${encodeRepoPath(path)}`,
    {
      method: 'DELETE',
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Delete diagram ${folder ? `${folder}/` : ''}${id}`,
        sha: meta.sha,
        branch: BRANCH,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to delete diagram: ${res.status} ${err}`);
  }
}

export async function renameDiagram(token, username, oldId, newId, folder = '') {
  const existing = await getFileMeta(token, username, newId, folder);
  if (existing) {
    throw new Error('Diagram id already exists');
  }

  const code = await loadDiagram(token, username, oldId, folder);
  if (code === null) {
    throw new Error('Not found');
  }

  await saveDiagram(token, username, newId, code, folder);
  await deleteDiagram(token, username, oldId, folder);
}

export async function moveDiagram(token, username, id, fromFolder = '', toFolder = '') {
  const normalizedFrom = normalizeFolder(fromFolder);
  const normalizedTo = normalizeFolder(toFolder);

  if (normalizedFrom === normalizedTo) {
    throw new Error('No change');
  }

  const code = await loadDiagram(token, username, id, normalizedFrom);
  if (code === null) {
    throw new Error('Not found');
  }

  const existing = await getFileMeta(token, username, id, normalizedTo);
  if (existing) {
    throw new Error('Diagram id already exists');
  }

  await saveDiagram(token, username, id, code, normalizedTo);
  await deleteDiagram(token, username, id, normalizedFrom);
}

export async function listDiagrams(token, username) {
  await ensureRepo(token, username);

  const treeSha = await getBranchTreeSha(token, username);
  if (!treeSha) return [];

  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/git/trees/${treeSha}?recursive=1`,
    { headers: githubHeaders(token) },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list diagrams: ${res.status} ${err}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.tree)) return [];

  return data.tree
    .filter((item) => item.type === 'blob')
    .map((item) => parseDiagramPath(item.path))
    .filter(Boolean)
    .map((parsed) => ({
      id: parsed.id,
      folder: parsed.folder,
      path: filePath(parsed.folder, parsed.id),
      url: `https://github.com/${username}/${REPO_NAME}/blob/${BRANCH}/${encodeRepoPath(filePath(parsed.folder, parsed.id))}`,
      updatedAt: null,
    }))
    .sort((a, b) => {
      const folderCmp = (a.folder || '').localeCompare(b.folder || '');
      if (folderCmp !== 0) return folderCmp;
      return a.id.localeCompare(b.id);
    });
}

export async function fetchPublicDiagram(username, id, folder = '') {
  const url = `https://raw.githubusercontent.com/${username}/${REPO_NAME}/${BRANCH}/${encodeRepoPath(filePath(folder, id))}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'odogram' },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch public diagram: ${res.status}`);
  }

  return res.text();
}

export function getShareUrl(origin, username, id, folder = '') {
  const f = normalizeFolder(folder);
  if (f) {
    return `${origin}/view/${encodeURIComponent(username)}/${encodeURIComponent(f)}/${encodeURIComponent(id)}`;
  }
  return `${origin}/view/${encodeURIComponent(username)}/${encodeURIComponent(id)}`;
}

export function getGitHubFileUrl(username, id, folder = '') {
  return `https://github.com/${username}/${REPO_NAME}/blob/${BRANCH}/${encodeRepoPath(filePath(folder, id))}`;
}
