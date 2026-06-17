const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseYamlLine(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  value = value.replace(/^['"]|['"]$/g, '');
  return [key, value];
}

export function splitFrontmatter(code) {
  const match = code.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: code.trim() };
  }
  return {
    frontmatter: match[1],
    body: code.slice(match[0].length).trim(),
  };
}

export function parseFrontmatterFields(code) {
  const { frontmatter, body } = splitFrontmatter(code);
  const fields = {
    format: 'mermaid',
    view: 'tree',
    title: '',
    folder: '',
    roadmap_source: '',
    body,
  };

  if (!frontmatter) return fields;

  for (const line of frontmatter.split('\n')) {
    const parsed = parseYamlLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (key === 'format') fields.format = value || 'mermaid';
    else if (key === 'view') fields.view = value || 'tree';
    else if (key === 'title') fields.title = value;
    else if (key === 'folder') fields.folder = value;
    else if (key === 'roadmap_source') fields.roadmap_source = value;
  }

  return fields;
}

export function parseDiagramFormat(code) {
  return parseFrontmatterFields(code).format === 'oproduct' ? 'oproduct' : 'mermaid';
}

export function isOproductFormat(code) {
  return parseDiagramFormat(code) === 'oproduct';
}
