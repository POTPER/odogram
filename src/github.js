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

function filePath(id) {
  return `${DIAGRAMS_DIR}/${id}.mmd`;
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

async function getFileMeta(token, username, id) {
  const path = filePath(id);
  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`,
    { headers: githubHeaders(token) },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get file meta: ${res.status} ${err}`);
  }

  return res.json();
}

export async function saveDiagram(token, username, id, code) {
  await ensureRepo(token, username);

  const path = filePath(id);
  const existing = await getFileMeta(token, username, id);

  const body = {
    message: existing ? `Update diagram ${id}` : `Add diagram ${id}`,
    content: btoa(unescape(encodeURIComponent(code))),
    branch: BRANCH,
  };

  if (existing?.sha) {
    body.sha = existing.sha;
  }

  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${path}`,
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

export async function loadDiagram(token, username, id) {
  const meta = await getFileMeta(token, username, id);
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

export async function listDiagrams(token, username) {
  await ensureRepo(token, username);

  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${DIAGRAMS_DIR}?ref=${BRANCH}`,
    { headers: githubHeaders(token) },
  );

  if (res.status === 404) return [];
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list diagrams: ${res.status} ${err}`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item.type === 'file' && item.name.endsWith('.mmd'))
    .map((item) => ({
      id: item.name.replace(/\.mmd$/, ''),
      name: item.name,
      path: item.path,
      url: item.html_url,
      updatedAt: null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchPublicDiagram(username, id) {
  const url = `https://raw.githubusercontent.com/${username}/${REPO_NAME}/${BRANCH}/${filePath(id)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'odogram' },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch public diagram: ${res.status}`);
  }

  return res.text();
}

export function getShareUrl(origin, username, id) {
  return `${origin}/view/${encodeURIComponent(username)}/${encodeURIComponent(id)}`;
}

export function getGitHubFileUrl(username, id) {
  return `https://github.com/${username}/${REPO_NAME}/blob/${BRANCH}/${filePath(id)}`;
}
