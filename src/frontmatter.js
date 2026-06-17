const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseYamlLine(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}

export function normalizeFolder(folder) {
  if (!folder) return '';
  return folder.replace(/^['"]|['"]$/g, '');
}

export function parseFrontmatter(body) {
  const match = body.match(FRONTMATTER_RE);
  if (!match) {
    return { folder: '', content: body.trim() };
  }

  let folder = '';
  for (const line of match[1].split('\n')) {
    const parsed = parseYamlLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (key === 'folder') folder = normalizeFolder(value);
  }

  return { folder, content: body.slice(match[0].length).trim() };
}

export function serializeFrontmatter(folder, content) {
  const lines = ['---'];
  lines.push(`folder: ${folder || '""'}`);
  lines.push('---', '', content.trim());
  return lines.join('\n');
}
