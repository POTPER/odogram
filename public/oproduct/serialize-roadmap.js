import { splitFrontmatter } from '../format.js';

const VIEW_ROADMAP_RE = /^@view\s+roadmap\s*$/i;
const VIEW_OTHER_RE = /^@view\s+(tree|journey)\s*$/i;

function rejoinSource(frontmatter, body) {
  const trimmedBody = body.trim();
  if (!frontmatter) return trimmedBody;
  return `---\n${frontmatter.trim()}\n---\n\n${trimmedBody}`;
}

function formatDeliver(deliver) {
  const status = deliver.status || 'plan';
  return `  deliver ${deliver.text} [${status}]`;
}

function formatMilestone(milestone) {
  const lines = [`milestone ${milestone.id}`];
  for (const deliver of milestone.delivers) {
    lines.push(formatDeliver(deliver));
  }
  return lines.join('\n');
}

export function buildRoadmapSection(milestones) {
  const lines = ['@view roadmap'];
  for (const milestone of milestones) {
    lines.push(formatMilestone(milestone));
  }
  return lines.join('\n');
}

function findRoadmapRange(lines) {
  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (VIEW_ROADMAP_RE.test(trimmed)) {
      start = i;
      continue;
    }
    if (start >= 0 && VIEW_OTHER_RE.test(trimmed)) {
      end = i;
      break;
    }
  }

  return { start, end };
}

export function patchRoadmapSection(source, milestones) {
  const { frontmatter, body } = splitFrontmatter(source);
  const newRoadmap = buildRoadmapSection(milestones);

  if (!body) {
    return rejoinSource(frontmatter, newRoadmap);
  }

  const lines = body.split('\n');
  const { start, end } = findRoadmapRange(lines);

  if (start < 0) {
    const newBody = body.trim() ? `${body.trim()}\n\n${newRoadmap}` : newRoadmap;
    return rejoinSource(frontmatter, newBody);
  }

  const before = lines.slice(0, start).join('\n').trimEnd();
  const after = lines.slice(end).join('\n').trimStart();
  const parts = [before, newRoadmap, after].filter((part) => part.length > 0);
  return rejoinSource(frontmatter, parts.join('\n\n'));
}
