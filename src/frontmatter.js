const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

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

export function parseFrontmatter(body) {
  const match = body.match(FRONTMATTER_RE);
  if (!match) {
    return {
      folder: '',
      format: 'mermaid',
      view: 'tree',
      title: '',
      content: body.trim(),
    };
  }

  let folder = '';
  let format = 'mermaid';
  let view = 'tree';
  let title = '';

  for (const line of match[1].split('\n')) {
    const parsed = parseYamlLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (key === 'folder') folder = normalizeFolder(value);
    else if (key === 'format') format = value || 'mermaid';
    else if (key === 'view') view = value || 'tree';
    else if (key === 'title') title = value;
  }

  return {
    folder,
    format,
    view,
    title,
    content: body.slice(match[0].length).trim(),
  };
}

export function serializeFrontmatter(folder, content) {
  const lines = ['---'];
  lines.push(`folder: ${folder || '""'}`);
  lines.push('---', '', content.trim());
  return lines.join('\n');
}
