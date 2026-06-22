const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const TAG_PATTERN = /^[\p{L}\p{N}_-]{2,32}$/u;
export const MAX_TAGS = 5;
export const TAG_FORMAT_HINT = '2–32 个字符：中文、字母、数字、下划线、连字符，最多 5 个，逗号分隔';

function parseYamlLine(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  value = value.replace(/^['"]|['"]$/g, '');
  return [key, value];
}

export function normalizeFolder(folder) {
  if (!folder) return '';
  return folder.replace(/^['"]|['"]$/g, '');
}

export function parseTags(value) {
  if (!value || !value.trim()) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags.join(', ');
}

export function validateTags(tags) {
  if (!Array.isArray(tags)) return TAG_FORMAT_HINT;
  if (tags.length > MAX_TAGS) return `最多 ${MAX_TAGS} 个标签`;
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag)) return TAG_FORMAT_HINT;
  }
  return null;
}

export function parseFrontmatter(body) {
  const match = body.match(FRONTMATTER_RE);
  if (!match) {
    return {
      folder: '',
      tags: [],
      format: 'mermaid',
      view: 'tree',
      title: '',
      content: body.trim(),
    };
  }

  let folder = '';
  let tags = [];
  let format = 'mermaid';
  let view = 'tree';
  let title = '';

  for (const line of match[1].split('\n')) {
    const parsed = parseYamlLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (key === 'folder') folder = normalizeFolder(value);
    else if (key === 'tags') tags = parseTags(value);
    else if (key === 'format') format = value || 'mermaid';
    else if (key === 'view') view = value || 'tree';
    else if (key === 'title') title = value;
  }

  return {
    folder,
    tags,
    format,
    view,
    title,
    content: body.slice(match[0].length).trim(),
  };
}

export function serializeFrontmatter(meta, content) {
  const {
    folder = '',
    tags = [],
    format = 'mermaid',
    view = 'tree',
    title = '',
  } = meta;

  const lines = ['---'];
  lines.push(`folder: ${folder ? folder : '""'}`);
  const tagLine = formatTags(tags);
  if (tagLine) lines.push(`tags: ${tagLine}`);
  if (format && format !== 'mermaid') lines.push(`format: ${format}`);
  if (view && view !== 'tree') lines.push(`view: ${view}`);
  if (title) lines.push(`title: ${title}`);
  lines.push('---', '', content.trim());
  return lines.join('\n');
}
