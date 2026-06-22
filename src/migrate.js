import { serializeFrontmatter } from './frontmatter.js';
import { DIAGRAM_LABEL, fetchAllDiagrams } from './github-graphql.js';
import { createIssue, ensureLabel } from './github-rest.js';
import { REPO_NAME, diagramKey, ensureRepo } from './github.js';

const DIAGRAMS_DIR = 'diagrams';
const BRANCH = 'main';
const MIGRATE_KV_PREFIX = 'migrate:v1:';

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'odogram',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function listContents(token, username, path) {
  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${encodeRepoPath(path)}?ref=${BRANCH}`,
    { headers: githubHeaders(token) },
  );

  if (res.status === 404) return [];
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list contents: ${res.status} ${err}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

async function loadLegacyFile(token, username, folder, id) {
  const rel = folder ? `${DIAGRAMS_DIR}/${folder}/${id}.mmd` : `${DIAGRAMS_DIR}/${id}.mmd`;
  const res = await fetch(
    `https://api.github.com/repos/${username}/${REPO_NAME}/contents/${encodeRepoPath(rel)}?ref=${BRANCH}`,
    { headers: githubHeaders(token) },
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to load legacy file: ${res.status} ${err}`);
  }

  const meta = await res.json();
  if (meta.content && meta.encoding === 'base64') {
    const binary = atob(meta.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (meta.download_url) {
    const dl = await fetch(meta.download_url, { headers: { 'User-Agent': 'odogram' } });
    if (!dl.ok) throw new Error(`Failed to download legacy file: ${dl.status}`);
    return dl.text();
  }

  return null;
}

async function listLegacyMmdFiles(token, username) {
  const rootItems = await listContents(token, username, DIAGRAMS_DIR);
  const results = [];

  for (const item of rootItems) {
    if (item.type === 'file' && item.name.endsWith('.mmd')) {
      results.push({ folder: '', id: item.name.replace(/\.mmd$/, '') });
      continue;
    }

    if (item.type === 'dir') {
      const folder = item.name;
      const subItems = await listContents(token, username, `${DIAGRAMS_DIR}/${folder}`);
      for (const sub of subItems) {
        if (sub.type === 'file' && sub.name.endsWith('.mmd')) {
          results.push({ folder, id: sub.name.replace(/\.mmd$/, '') });
        }
      }
    }
  }

  return results;
}

export function migrateKvKey(username) {
  return `${MIGRATE_KV_PREFIX}${username}`;
}

export async function isMigrated(kv, username) {
  if (!kv) return true;
  const flag = await kv.get(migrateKvKey(username));
  return flag === '1';
}

export async function migrateIfNeeded(session, kv) {
  if (!session?.token || !session?.username || !kv) return { migrated: false, skipped: true };

  if (await isMigrated(kv, session.username)) {
    return { migrated: false, skipped: true };
  }

  await ensureRepo(session.token, session.username);
  await ensureLabel(session.token, session.username, REPO_NAME, DIAGRAM_LABEL);

  const legacyFiles = await listLegacyMmdFiles(session.token, session.username);
  if (legacyFiles.length === 0) {
    await kv.put(migrateKvKey(session.username), '1');
    return { migrated: true, count: 0 };
  }

  const existing = await fetchAllDiagrams(session.token, session.username, REPO_NAME, {
    states: ['OPEN'],
  });
  const existingKeys = new Set(existing.map((d) => diagramKey(d.folder, d.id)));

  let created = 0;
  for (const { folder, id } of legacyFiles) {
    const key = diagramKey(folder, id);
    if (existingKeys.has(key)) continue;

    const code = await loadLegacyFile(session.token, session.username, folder, id);
    if (code === null) continue;

    const body = serializeFrontmatter({ folder }, code);
    await createIssue(session.token, session.username, REPO_NAME, {
      title: id,
      body,
      labels: [DIAGRAM_LABEL],
    });
    existingKeys.add(key);
    created += 1;
  }

  await kv.put(migrateKvKey(session.username), '1');
  return { migrated: true, count: created };
}
