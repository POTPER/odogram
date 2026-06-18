import { serializeFrontmatter, parseFrontmatter, normalizeFolder } from './frontmatter.js';
import { DIAGRAM_LABEL, fetchAllDiagrams } from './github-graphql.js';
import {
  GitHubError,
  createIssue,
  ensureLabel,
  updateIssue,
} from './github-rest.js';

export const REPO_NAME = 'odogram-diagrams';
export { normalizeFolder };

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'odogram',
};

function githubHeaders(token) {
  return {
    ...GH_HEADERS,
    Authorization: `Bearer ${token}`,
  };
}

function diagramKey(folder, id) {
  const f = normalizeFolder(folder);
  return f ? `${f}/${id}` : id;
}

function toDiagramEntry(username, item) {
  return {
    id: item.id,
    folder: item.folder || '',
    number: item.number,
    updatedAt: item.updatedAt,
    url: getGitHubIssueUrl(username, item.number),
  };
}

export function getGitHubIssueUrl(username, number) {
  return `https://github.com/${username}/${REPO_NAME}/issues/${number}`;
}

export function getGitHubFileUrl(username, id, folder = '', number) {
  if (number) return getGitHubIssueUrl(username, number);
  return `https://github.com/${username}/${REPO_NAME}/issues`;
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

    await ensureLabel(token, username, REPO_NAME, DIAGRAM_LABEL);
    return;
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to check repo: ${res.status} ${err}`);
  }

  await ensureLabel(token, username, REPO_NAME, DIAGRAM_LABEL);
}

async function fetchOpenDiagrams(token, username) {
  await ensureRepo(token, username);
  return fetchAllDiagrams(token, username, REPO_NAME, { states: ['OPEN'] });
}

function findDiagramByKey(diagrams, folder, id) {
  const f = normalizeFolder(folder);
  return diagrams.find((d) => d.id === id && (d.folder || '') === f) ?? null;
}

export async function saveDiagram(token, username, id, code, folder = '', expectedUpdatedAt) {
  await ensureRepo(token, username);

  const normalizedFolder = normalizeFolder(folder);
  const diagrams = await fetchOpenDiagrams(token, username);
  const existing = findDiagramByKey(diagrams, normalizedFolder, id);
  const body = serializeFrontmatter(normalizedFolder, code);

  if (existing) {
    const issue = await updateIssue(
      token,
      username,
      REPO_NAME,
      existing.number,
      { body },
      expectedUpdatedAt,
    );
    return {
      id,
      folder: normalizedFolder,
      number: issue.number,
      updatedAt: issue.updated_at,
    };
  }

  const issue = await createIssue(token, username, REPO_NAME, {
    title: id,
    body,
    labels: [DIAGRAM_LABEL],
  });

  return {
    id,
    folder: normalizedFolder,
    number: issue.number,
    updatedAt: issue.updated_at,
  };
}

export async function loadDiagramDetail(token, username, id, folder = '') {
  const diagrams = await fetchOpenDiagrams(token, username);
  const match = findDiagramByKey(diagrams, folder, id);
  if (!match) return null;

  return {
    id: match.id,
    folder: match.folder || '',
    number: match.number,
    updatedAt: match.updatedAt,
    code: match.content ?? '',
  };
}

export async function deleteDiagram(token, username, id, folder = '') {
  const diagrams = await fetchOpenDiagrams(token, username);
  const match = findDiagramByKey(diagrams, folder, id);
  if (!match) {
    throw new Error('Not found');
  }

  await updateIssue(token, username, REPO_NAME, match.number, { state: 'closed' });
}

export async function renameDiagram(token, username, oldId, newId, folder = '') {
  const normalizedFolder = normalizeFolder(folder);
  const diagrams = await fetchOpenDiagrams(token, username);
  const existing = findDiagramByKey(diagrams, normalizedFolder, oldId);
  if (!existing) {
    throw new Error('Not found');
  }

  const duplicate = findDiagramByKey(diagrams, normalizedFolder, newId);
  if (duplicate) {
    throw new Error('Diagram id already exists');
  }

  const issue = await updateIssue(token, username, REPO_NAME, existing.number, {
    title: newId,
  });

  return {
    id: newId,
    folder: normalizedFolder,
    number: issue.number,
    updatedAt: issue.updated_at,
  };
}

export async function moveDiagram(token, username, id, fromFolder = '', toFolder = '') {
  const normalizedFrom = normalizeFolder(fromFolder);
  const normalizedTo = normalizeFolder(toFolder);

  if (normalizedFrom === normalizedTo) {
    throw new Error('No change');
  }

  const diagrams = await fetchOpenDiagrams(token, username);
  const existing = findDiagramByKey(diagrams, normalizedFrom, id);
  if (!existing) {
    throw new Error('Not found');
  }

  const duplicate = findDiagramByKey(diagrams, normalizedTo, id);
  if (duplicate) {
    throw new Error('Diagram id already exists');
  }

  const body = serializeFrontmatter(normalizedTo, existing.content ?? '');
  const issue = await updateIssue(token, username, REPO_NAME, existing.number, { body });

  return {
    id,
    folder: normalizedTo,
    number: issue.number,
    updatedAt: issue.updated_at,
  };
}

export async function listDiagrams(token, username) {
  const diagrams = await fetchOpenDiagrams(token, username);
  return diagrams.map((item) => toDiagramEntry(username, item)).sort((a, b) => {
    const folderCmp = (a.folder || '').localeCompare(b.folder || '');
    if (folderCmp !== 0) return folderCmp;
    return a.id.localeCompare(b.id);
  });
}

export async function fetchPublicDiagram(username, id, folder = '') {
  const normalizedFolder = normalizeFolder(folder);
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${username}/${REPO_NAME}/issues?labels=${encodeURIComponent(DIAGRAM_LABEL)}&state=open&per_page=100&page=${page}`,
      { headers: GH_HEADERS },
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to fetch public diagram: ${res.status}`);
    }

    const batch = await res.json();
    for (const issue of batch) {
      if (issue.pull_request) continue;
      if (issue.title !== id) continue;
      const { folder: issueFolder, content } = parseFrontmatter(issue.body ?? '');
      if ((issueFolder || '') === normalizedFolder) {
        return content;
      }
    }

    if (batch.length < 100) break;
    page += 1;
  }

  return null;
}

export function getShareUrl(origin, username, id, folder = '') {
  const f = normalizeFolder(folder);
  if (f) {
    return `${origin}/view/${encodeURIComponent(username)}/${encodeURIComponent(f)}/${encodeURIComponent(id)}`;
  }
  return `${origin}/view/${encodeURIComponent(username)}/${encodeURIComponent(id)}`;
}

export { GitHubError, diagramKey };
