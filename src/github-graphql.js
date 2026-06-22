import { parseFrontmatter } from './frontmatter.js';

export const DIAGRAM_LABEL = 'odogram:diagram';

export async function fetchAllDiagrams(token, owner, repo, { states = ['OPEN'] } = {}) {
  const diagrams = [];
  let cursor = null;

  while (true) {
    const stateList = states.map((s) => s.toUpperCase()).join(', ');
    const query = `
      query DiagramIndex($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 50, after: $cursor, labels: ["${DIAGRAM_LABEL}"], states: [${stateList}]) {
            pageInfo { hasNextPage endCursor }
            nodes { number title body state updatedAt }
          }
        }
      }
    `;

    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'odogram',
      },
      body: JSON.stringify({ query, variables: { owner, repo, cursor } }),
    });

    if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const issues = json.data?.repository?.issues;
    if (!issues) break;

    for (const node of issues.nodes) {
      const parsed = parseFrontmatter(node.body ?? '');
      diagrams.push({
        number: node.number,
        id: node.title,
        folder: parsed.folder,
        tags: parsed.tags,
        format: parsed.format,
        view: parsed.view,
        title: parsed.title,
        content: parsed.content,
        state: node.state === 'OPEN' ? 'open' : 'closed',
        updatedAt: node.updatedAt,
      });
    }

    if (!issues.pageInfo.hasNextPage) break;
    cursor = issues.pageInfo.endCursor;
  }

  return diagrams.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
