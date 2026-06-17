const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'odogram',
};

export class GitHubError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function ghFetch(token, path, init) {
  const headers = {
    ...GH_HEADERS,
    ...(init?.headers ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GitHubError(`GitHub API error: ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined;
  return res.json();
}

export async function ensureLabel(token, owner, repo, name, color = '0969da') {
  try {
    await ghFetch(token, `/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, description: 'odogram system label' }),
    });
  } catch (e) {
    if (e instanceof GitHubError && e.status === 422) return;
    throw e;
  }
}

export async function getIssue(token, owner, repo, number) {
  return ghFetch(token, `/repos/${owner}/${repo}/issues/${number}`);
}

export async function createIssue(token, owner, repo, data) {
  return ghFetch(token, `/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateIssue(token, owner, repo, number, data, expectedUpdatedAt) {
  if (expectedUpdatedAt) {
    const current = await getIssue(token, owner, repo, number);
    if (current.updated_at !== expectedUpdatedAt) {
      throw new GitHubError('Conflict: diagram was modified elsewhere', 409);
    }
  }
  return ghFetch(token, `/repos/${owner}/${repo}/issues/${number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function listIssues(token, owner, repo, label, state = 'open') {
  const issues = [];
  let page = 1;
  while (true) {
    const batch = await ghFetch(
      token,
      `/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=${state}&per_page=100&page=${page}`,
    );
    const filtered = batch.filter((i) => !i.pull_request);
    issues.push(...filtered);
    if (batch.length < 100) break;
    page += 1;
  }
  return issues;
}
