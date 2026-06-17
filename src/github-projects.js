export const ROADMAP_LABEL = 'odogram:roadmap';
export const DIAGRAM_LABEL = 'odogram:diagram';

const ITERATION_FIELD_NAMES = ['iteration', '迭代', 'milestone', '里程碑'];
const STATUS_FIELD_NAMES = ['status', '状态'];

const PROJECT_ITEMS_FRAGMENT = `
  url
  title
  items(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      content {
        __typename
        ... on Issue {
          title
          url
          labels(first: 20) { nodes { name } }
        }
        ... on DraftIssue {
          title
          body
        }
      }
      fieldValues(first: 20) {
        nodes {
          ... on ProjectV2ItemFieldSingleSelectValue {
            name
            field { ... on ProjectV2SingleSelectField { name } }
          }
          ... on ProjectV2ItemFieldIterationValue {
            title
            field { ... on ProjectV2IterationField { name } }
          }
        }
      }
    }
  }
`;

function buildProjectQuery(ownerType) {
  const root = ownerType === 'organization' ? 'organization' : 'user';
  return `
    query ProjectRoadmap($owner: String!, $number: Int!, $cursor: String) {
      ${root}(login: $owner) {
        projectV2(number: $number) {
          ${PROJECT_ITEMS_FRAGMENT}
        }
      }
    }
  `;
}

async function ghGraphql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'odogram',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL failed: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}

function fieldNameMatches(fieldName, candidates) {
  const lower = (fieldName || '').toLowerCase();
  return candidates.some((name) => lower === name.toLowerCase());
}

function mapStatusValue(name) {
  const lower = (name || '').toLowerCase();
  if (lower === 'done' || lower === '已完成' || lower === '完成') return 'done';
  if (lower === 'in progress' || lower === '进行中' || lower === 'in_progress') {
    return 'progress';
  }
  return 'plan';
}

function shouldIncludeItem(content) {
  if (!content) return false;

  if (content.__typename === 'DraftIssue') {
    return true;
  }

  if (content.__typename === 'Issue') {
    const labels = (content.labels?.nodes || []).map((node) => node.name);
    if (labels.includes(DIAGRAM_LABEL)) return false;
    return labels.includes(ROADMAP_LABEL);
  }

  return false;
}

function getItemTitle(content) {
  if (!content) return '';
  return (content.title || '').trim();
}

function getItemUrl(content) {
  if (content?.__typename === 'Issue') {
    return content.url || undefined;
  }
  return undefined;
}

function extractFieldValues(fieldValues) {
  let iteration = '';
  let status = 'plan';

  for (const node of fieldValues?.nodes || []) {
    const fieldName = node.field?.name;
    if (!fieldName) continue;

    if (fieldNameMatches(fieldName, ITERATION_FIELD_NAMES) && node.title) {
      iteration = node.title.trim();
    }

    if (fieldNameMatches(fieldName, STATUS_FIELD_NAMES) && node.name) {
      status = mapStatusValue(node.name);
    }
  }

  return { iteration, status };
}

function addDeliverable(milestoneMap, order, iteration, deliver) {
  const key = iteration || 'Backlog';
  if (!milestoneMap.has(key)) {
    milestoneMap.set(key, { id: key, delivers: [], order: order.length });
    order.push(key);
  }
  milestoneMap.get(key).delivers.push(deliver);
}

async function fetchProjectItems(token, owner, number, ownerType) {
  const items = [];
  let cursor = null;
  let project = null;

  while (true) {
    const data = await ghGraphql(token, buildProjectQuery(ownerType), {
      owner,
      number,
      cursor,
    });

    const root = ownerType === 'organization' ? data.organization : data.user;
    project = root?.projectV2;
    if (!project) return null;

    for (const node of project.items?.nodes || []) {
      items.push(node);
    }

    const pageInfo = project.items?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  return { project, items };
}

function itemsToMilestones(items) {
  const milestoneMap = new Map();
  const order = [];

  for (const item of items) {
    const content = item.content;
    if (!shouldIncludeItem(content)) continue;

    const title = getItemTitle(content);
    if (!title) continue;

    const { iteration, status } = extractFieldValues(item.fieldValues);
    addDeliverable(milestoneMap, order, iteration, {
      text: title,
      status,
      url: getItemUrl(content),
    });
  }

  return order
    .map((key) => milestoneMap.get(key))
    .filter(Boolean);
}

export async function fetchOfficialRoadmap(env) {
  const token = env.GITHUB_OFFICIAL_TOKEN?.trim();
  const owner = env.OFFICIAL_PROJECT_OWNER?.trim();
  const numberRaw = env.OFFICIAL_PROJECT_NUMBER?.trim();

  if (!token || !owner || !numberRaw) {
    return { enabled: false };
  }

  const number = Number.parseInt(numberRaw, 10);
  if (!Number.isFinite(number) || number < 1) {
    return { enabled: false };
  }

  try {
    let result = await fetchProjectItems(token, owner, number, 'user');
    if (!result?.project) {
      result = await fetchProjectItems(token, owner, number, 'organization');
    }

    if (!result?.project) {
      return { enabled: true, error: 'Project not found', milestones: null };
    }

    const milestones = itemsToMilestones(result.items);

    return {
      enabled: true,
      projectUrl: result.project.url,
      projectTitle: result.project.title,
      milestones,
    };
  } catch (err) {
    return {
      enabled: true,
      error: err.message || 'Failed to fetch project',
      milestones: null,
    };
  }
}
