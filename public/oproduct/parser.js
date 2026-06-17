import { parseFrontmatterFields } from '../format.js';
import { VIEWS, STATUSES, createEmptyDoc } from './model.js';

function parseStatus(raw) {
  const status = (raw || 'plan').toLowerCase();
  return STATUSES.includes(status) ? status : 'plan';
}

function parseFeatureLine(text) {
  const match = text.match(/^feature\s+(.+?)(?:\s+\[(done|plan|deprecated)\])?\s*$/i);
  if (!match) return null;
  return { text: match[1].trim(), status: parseStatus(match[2]) };
}

function parseDeliverLine(text) {
  const match = text.match(/^deliver\s+(.+?)(?:\s+\[(done|plan|deprecated)\])?\s*$/i);
  if (!match) return null;
  return { text: match[1].trim(), status: parseStatus(match[2]) };
}

function parseStepLine(text) {
  const match = text.match(/^step\s+(.+?)\s*->\s*(.+)\s*$/i);
  if (!match) return null;
  return { action: match[1].trim(), touchpoint: match[2].trim() };
}

export function parseOproductDocument(source) {
  const fields = parseFrontmatterFields(source);
  const doc = createEmptyDoc(fields.title);
  doc.defaultView = VIEWS.includes(fields.view) ? fields.view : 'tree';

  const body = fields.body;
  if (!body) {
    return { ok: true, doc };
  }

  let currentView = doc.defaultView;
  let currentModule = null;
  let currentMilestone = null;
  let currentPersona = null;

  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const viewMatch = trimmed.match(/^@view\s+(tree|roadmap|journey)\s*$/i);
    if (viewMatch) {
      currentView = viewMatch[1].toLowerCase();
      currentModule = null;
      currentMilestone = null;
      currentPersona = null;
      continue;
    }

    const moduleMatch = trimmed.match(/^module\s+(.+)\s*$/i);
    if (moduleMatch) {
      if (currentView !== 'tree') {
        return { ok: false, error: `Line ${lineNum}: module is only valid in tree view` };
      }
      currentModule = { name: moduleMatch[1].trim(), features: [] };
      doc.views.tree.modules.push(currentModule);
      continue;
    }

    const milestoneMatch = trimmed.match(/^milestone\s+(.+)\s*$/i);
    if (milestoneMatch) {
      if (currentView !== 'roadmap') {
        return { ok: false, error: `Line ${lineNum}: milestone is only valid in roadmap view` };
      }
      currentMilestone = { id: milestoneMatch[1].trim(), delivers: [] };
      doc.views.roadmap.milestones.push(currentMilestone);
      continue;
    }

    const personaMatch = trimmed.match(/^persona\s+(.+)\s*$/i);
    if (personaMatch) {
      if (currentView !== 'journey') {
        return { ok: false, error: `Line ${lineNum}: persona is only valid in journey view` };
      }
      currentPersona = { name: personaMatch[1].trim(), steps: [] };
      doc.views.journey.personas.push(currentPersona);
      continue;
    }

    const indent = raw.match(/^\s*/)[0].length;
    const content = trimmed;

    if (/^feature\s+/i.test(content)) {
      if (currentView !== 'tree' || !currentModule) {
        return { ok: false, error: `Line ${lineNum}: feature must follow a module in tree view` };
      }
      const feature = parseFeatureLine(content);
      if (!feature) {
        return { ok: false, error: `Line ${lineNum}: invalid feature syntax` };
      }
      currentModule.features.push(feature);
      continue;
    }

    if (/^deliver\s+/i.test(content)) {
      if (currentView !== 'roadmap' || !currentMilestone) {
        return { ok: false, error: `Line ${lineNum}: deliver must follow a milestone in roadmap view` };
      }
      const deliver = parseDeliverLine(content);
      if (!deliver) {
        return { ok: false, error: `Line ${lineNum}: invalid deliver syntax` };
      }
      currentMilestone.delivers.push(deliver);
      continue;
    }

    if (/^step\s+/i.test(content)) {
      if (currentView !== 'journey' || !currentPersona) {
        return { ok: false, error: `Line ${lineNum}: step must follow a persona in journey view` };
      }
      const step = parseStepLine(content);
      if (!step) {
        return { ok: false, error: `Line ${lineNum}: invalid step syntax (use: step action -> touchpoint)` };
      }
      currentPersona.steps.push(step);
      continue;
    }

    return { ok: false, error: `Line ${lineNum}: unrecognized statement "${trimmed}"` };
  }

  return { ok: true, doc };
}
