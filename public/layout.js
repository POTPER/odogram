const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const LAYOUT_MODES = {
  dagre: 'Default',
  elk: 'Orthogonal',
};

function splitFrontmatter(code) {
  const match = code.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: code };
  }
  return { frontmatter: match[1], body: code.slice(match[0].length) };
}

function normalizeLayout(layout) {
  return layout === 'elk' ? 'elk' : 'dagre';
}

export function parseLayoutFromCode(code) {
  const { frontmatter } = splitFrontmatter(code);
  if (!frontmatter) return 'dagre';

  const match = frontmatter.match(/layout\s*:\s*(\S+)/);
  if (!match) return 'dagre';

  const value = match[1].replace(/['"]/g, '');
  return value === 'elk' || value.startsWith('elk.') ? 'elk' : 'dagre';
}

function removeLayoutFromFrontmatter(frontmatter) {
  let updated = frontmatter
    .replace(/^\s{2}layout\s*:\s*\S+\s*$/gm, '')
    .replace(/^layout\s*:\s*\S+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (/^config:\s*$/m.test(updated)) {
    updated = updated.replace(/^config:\s*$/m, '').trim();
  }

  return updated;
}

function upsertLayoutInFrontmatter(frontmatter) {
  if (/layout\s*:\s*\S+/.test(frontmatter)) {
    return frontmatter.replace(/layout\s*:\s*\S+/, 'layout: elk');
  }

  if (/^config:\s*$/m.test(frontmatter) || /^config:\s*\n/m.test(frontmatter)) {
    return frontmatter.replace(/^config:\s*\n?/m, 'config:\n  layout: elk\n');
  }

  return `config:\n  layout: elk\n${frontmatter}`;
}

export function applyLayoutFrontmatter(code, layout) {
  const mode = normalizeLayout(layout);
  const { frontmatter, body } = splitFrontmatter(code);

  if (mode === 'elk') {
    if (frontmatter === null) {
      const prefix = '---\nconfig:\n  layout: elk\n---\n';
      return body.length ? prefix + body : prefix;
    }

    const updated = upsertLayoutInFrontmatter(frontmatter);
    return `---\n${updated}\n---\n${body}`;
  }

  if (frontmatter === null) return code;

  const updated = removeLayoutFromFrontmatter(frontmatter);
  if (!updated) return body;
  return `---\n${updated}\n---\n${body}`;
}
