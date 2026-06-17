const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function splitSource(source) {
  const match = source.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: source };
  }
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}

function rejoinSource({ frontmatter, body }) {
  if (frontmatter === null) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\\n/g, '\n')
    .trim();
}

function labelsMatch(a, b) {
  return normalizeLabel(a) === normalizeLabel(b);
}

function formatQuoted(newText, wasQuoted) {
  if (wasQuoted) {
    return `"${newText.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (/[\[\]:;,"'#|]/.test(newText) || /\s/.test(newText)) {
    return `"${newText.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return newText;
}

function replaceOnce(body, regex, replacer) {
  let replaced = false;
  const next = body.replace(regex, (...args) => {
    if (replaced) return args[0];
    const result = replacer(...args);
    if (result !== args[0]) replaced = true;
    return result;
  });
  return replaced ? next : null;
}

export function detectDiagramType(source) {
  const { body } = splitSource(source);
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    if (/^flowchart\b/i.test(trimmed) || /^graph\b/i.test(trimmed)) {
      return 'flowchart';
    }

    const kw = trimmed.split(/\s+/)[0];
    const known = [
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram-v2',
      'stateDiagram',
      'erDiagram',
      'journey',
      'gantt',
      'pie',
      'gitGraph',
      'mindmap',
      'timeline',
      'quadrantChart',
      'requirementDiagram',
      'C4Context',
    ];
    if (known.includes(kw)) return kw;
    return kw;
  }
  return null;
}

function patchFlowchart(body, { nodeKey, oldText, newText, kind }) {
  const id = escapeRegex(nodeKey);

  if (kind === 'cluster') {
    const re = new RegExp(`(subgraph\\s+${id}\\s*\\[)([^\\]]*)(\\])`, 'i');
    const result = replaceOnce(body, re, (m, open, label, close) => {
      if (!labelsMatch(label, oldText)) return m;
      return `${open}${newText}${close}`;
    });
    if (result) return result;
    return null;
  }

  const bracketPatterns = [
    { open: '[[', close: ']]' },
    { open: '[', close: ']' },
    { open: '[(', close: ')]' },
    { open: '((', close: '))' },
    { open: '(', close: ')' },
    { open: '{{', close: '}}' },
    { open: '{', close: '}' },
    { open: '>', close: ']' },
  ];

  for (const { open, close } of bracketPatterns) {
    const openEsc = escapeRegex(open);
    const closeEsc = escapeRegex(close);
    const re = new RegExp(
      `(^|[^\\w$])(${id})(\\s*${openEsc})((?:[^${close[0]}\\\\]|\\\\.)*)(${closeEsc})`,
      'gm',
    );
    const result = replaceOnce(body, re, (m, pre, key, o, label, c) => {
      if (!labelsMatch(label, oldText)) return m;
      const wasQuoted = label.trim().startsWith('"');
      const formatted = formatQuoted(newText, wasQuoted);
      return `${pre}${key}${o}${formatted}${c}`;
    });
    if (result) return result;
  }

  return null;
}

function patchPie(body, { nodeKey, oldText, newText }) {
  if (nodeKey === '__title__') {
    const re = /^(\s*title\s+)(.+)$/im;
    return replaceOnce(body, re, (m, prefix, title) => {
      if (!labelsMatch(title.trim(), oldText)) return m;
      return `${prefix}${newText}`;
    });
  }

  const re = new RegExp(`(["'])(${escapeRegex(oldText)})\\1(\\s*:\\s*[^\\n]+)`, 'g');
  return replaceOnce(body, re, (m, q, label, rest) => {
    if (!labelsMatch(label, oldText)) return m;
    return `${q}${newText}${q}${rest}`;
  });
}

function patchSequence(body, { nodeKey, oldText, newText, kind }) {
  const id = escapeRegex(nodeKey);

  if (kind === 'participant' || kind === 'actor') {
    const re = new RegExp(`(${kind}\\s+${id}\\s+as\\s+)(.+)$`, 'im');
    return replaceOnce(body, re, (m, prefix, label) => {
      if (!labelsMatch(label.trim(), oldText)) return m;
      return `${prefix}${newText}`;
    });
  }

  const msgRe = new RegExp(
    `(^\\s*(?:${id}|\\w+)\\s*(?:->>|-->>|->|-->|-x|--x)\\s*(?:\\w+|:)\\s*)(.+)$`,
    'im',
  );
  return replaceOnce(body, msgRe, (m, prefix, msg) => {
    if (!labelsMatch(msg.trim(), oldText)) return m;
    return `${prefix}${newText}`;
  });
}

function patchClass(body, { nodeKey, oldText, newText }) {
  const id = escapeRegex(nodeKey);
  const re = new RegExp(`(class\\s+${id}\\s+)([^\\n{]+)`, 'i');
  const result = replaceOnce(body, re, (m, prefix, label) => {
    if (!labelsMatch(label.trim(), oldText)) return m;
    return `${prefix}${newText}`;
  });
  if (result) return result;

  const noteRe = new RegExp(`(note\\s+(?:for\\s+)?${id}\\s*:\\s*)(.+)$`, 'im');
  return replaceOnce(body, noteRe, (m, prefix, label) => {
    if (!labelsMatch(label.trim(), oldText)) return m;
    return `${prefix}${newText}`;
  });
}

function patchState(body, { nodeKey, oldText, newText }) {
  const id = escapeRegex(nodeKey);
  const patterns = [
    new RegExp(`(state\\s+${id}\\s*:\\s*)(.+)$`, 'im'),
    new RegExp(`(state\\s+["']${id}["']\\s*:\\s*)(.+)$`, 'im'),
    new RegExp(`(\\b${id}\\s*:\\s*)(.+)$`, 'im'),
  ];
  for (const re of patterns) {
    const result = replaceOnce(body, re, (m, prefix, label) => {
      if (!labelsMatch(label.trim(), oldText)) return m;
      return `${prefix}${newText}`;
    });
    if (result) return result;
  }
  return null;
}

function patchEr(body, { nodeKey, oldText, newText }) {
  const id = escapeRegex(nodeKey);
  const attrRe = new RegExp(`(^\\s+${id}\\s+\\w+\\s+)(.+)$`, 'im');
  const attrResult = replaceOnce(body, attrRe, (m, prefix, label) => {
    if (!labelsMatch(label.trim(), oldText)) return m;
    return `${prefix}${newText}`;
  });
  if (attrResult) return attrResult;

  const entityRe = new RegExp(`(${id}\\s*\\{[^}]*?)(\\b${escapeRegex(oldText)}\\b)([^}]*\\})`, 's');
  return replaceOnce(body, entityRe, (m, pre, label, post) => {
    if (!labelsMatch(label, oldText)) return m;
    return `${pre}${newText}${post}`;
  });
}

function patchGantt(body, { nodeKey, oldText, newText, kind }) {
  if (kind === 'section') {
    const re = new RegExp(`(^\\s*section\\s+)(.+)$`, 'im');
    return replaceOnce(body, re, (m, prefix, title) => {
      if (!labelsMatch(title.trim(), oldText)) return m;
      return `${prefix}${newText}`;
    });
  }

  const re = new RegExp(`(^\\s*)([^\\n:]+)(\\s*:\\s*[^\\n]+)$`, 'im');
  return replaceOnce(body, re, (m, indent, title, rest) => {
    if (!labelsMatch(title.trim(), oldText)) return m;
    if (/^section\b/i.test(title.trim())) return m;
    return `${indent}${newText}${rest}`;
  });
}

function patchJourney(body, { oldText, newText }) {
  const re = new RegExp(`(^\\s*)([^\\n:]+)(\\s*:\\s*[^\\n]+)$`, 'im');
  return replaceOnce(body, re, (m, indent, title, rest) => {
    if (!labelsMatch(title.trim(), oldText)) return m;
    if (/^title\b/i.test(title.trim()) || /^section\b/i.test(title.trim())) return m;
    return `${indent}${newText}${rest}`;
  });
}

function patchTimeline(body, { oldText, newText }) {
  const re = new RegExp(`(^\\s*)([^:]+)(\\s*:\\s*[^\\n]+)$`, 'im');
  return replaceOnce(body, re, (m, indent, title, rest) => {
    if (!labelsMatch(title.trim(), oldText)) return m;
    if (/^title\b/i.test(title.trim())) return m;
    return `${indent}${newText}${rest}`;
  });
}

function patchMindmap(body, { nodeKey, oldText, newText }) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || /^mindmap\b/i.test(trimmed)) continue;

    const textMatch = line.match(/^(\s*)(.+)$/);
    if (!textMatch) continue;
    let content = textMatch[2];
    content = content.replace(/^\(\(/, '').replace(/\)\)$/, '').replace(/^\[/, '').replace(/\]$/, '');
    if (nodeKey && !line.includes(nodeKey) && !labelsMatch(content, oldText)) continue;
    if (!labelsMatch(content, oldText)) continue;
    lines[i] = `${textMatch[1]}${newText}`;
    return lines.join('\n');
  }
  return null;
}

function patchQuadrant(body, { oldText, newText }) {
  const re = new RegExp(`(^\\s*)(.+?)(\\s*:\\s*\\[[^\\]]*\\])$`, 'im');
  return replaceOnce(body, re, (m, indent, label, rest) => {
    if (!labelsMatch(label.trim(), oldText)) return m;
    return `${indent}${newText}${rest}`;
  });
}

function patchGitGraph(body, { oldText, newText }) {
  const re = new RegExp(`(commit\\s+(?:id:\\s*\\S+\\s+)?(?:tag:\\s*["']?[^"']*["']?\\s+)?)(.+)$`, 'im');
  return replaceOnce(body, re, (m, prefix, label) => {
    if (!labelsMatch(label.trim(), oldText)) return m;
    return `${prefix}${newText}`;
  });
}

function patchRequirement(body, { nodeKey, oldText, newText }) {
  const id = escapeRegex(nodeKey);
  const re = new RegExp(`(requirement\\s+${id}\\s*\\{[^}]*?text:\\s*)(.+?)(\\s*\\})`, 's');
  return replaceOnce(body, re, (m, prefix, label, close) => {
    if (!labelsMatch(label.trim(), oldText)) return m;
    return `${prefix}${newText}${close}`;
  });
}

function patchC4(body, { nodeKey, oldText, newText }) {
  const id = escapeRegex(nodeKey);
  const patterns = [
    new RegExp(`(Person\\(${id},\\s*["'])([^"']*)(["'])`, 'i'),
    new RegExp(`(System\\(${id},\\s*["'])([^"']*)(["'])`, 'i'),
    new RegExp(`(Container\\(${id},\\s*["'])([^"']*)(["'])`, 'i'),
  ];
  for (const re of patterns) {
    const result = replaceOnce(body, re, (m, open, label, close) => {
      if (!labelsMatch(label, oldText)) return m;
      return `${open}${newText}${close}`;
    });
    if (result) return result;
  }
  return null;
}

function patchByTextFallback(body, { oldText, newText }) {
  if (body.includes(oldText)) {
    return body.replace(oldText, newText);
  }
  const brForm = oldText.replace(/\n/g, '<br/>');
  if (body.includes(brForm)) {
    return body.replace(brForm, newText.replace(/\n/g, '<br/>'));
  }
  return null;
}

const PATCHERS = {
  flowchart: patchFlowchart,
  graph: patchFlowchart,
  pie: patchPie,
  sequenceDiagram: patchSequence,
  classDiagram: patchClass,
  stateDiagram: patchState,
  'stateDiagram-v2': patchState,
  erDiagram: patchEr,
  gantt: patchGantt,
  journey: patchJourney,
  timeline: patchTimeline,
  mindmap: patchMindmap,
  quadrantChart: patchQuadrant,
  gitGraph: patchGitGraph,
  requirementDiagram: patchRequirement,
  C4Context: patchC4,
};

export function patchLabel(source, meta) {
  const type = detectDiagramType(source);
  if (!type) return null;

  const { frontmatter, body } = splitSource(source);
  const patcher = PATCHERS[type];
  let patchedBody = patcher ? patcher(body, meta) : null;

  if (!patchedBody) {
    patchedBody = patchByTextFallback(body, meta);
  }

  if (!patchedBody || patchedBody === body) return null;
  return rejoinSource({ frontmatter, body: patchedBody });
}
