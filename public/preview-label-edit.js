import { patchLabel } from './label-patchers.js';

let editing = false;
let activeEditor = null;
let activeSvg = null;
let dblClickHandler = null;
let committing = false;

export function isLabelEditBlockingPan() {
  return editing;
}

function normalizeLabelText(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function extractNodeKey(containerEl, kind) {
  const id = containerEl.id || '';
  if (kind === 'cluster') {
    const cluster = id.match(/^cluster-(.+)$/);
    if (cluster) return cluster[1];
    const flow = id.match(/^flowchart-(.+)-\d+$/);
    if (flow) return flow[1];
    return id.replace(/^subGraph/i, '') || id;
  }

  const patterns = [
    /^flowchart-(.+)-\d+$/,
    /^state-(.+)-\d+$/,
    /^actor-(.+)$/,
    /^actor-manual-(.+)$/,
    /^participant-(.+)$/,
    /^classId-(.+)-\d+$/,
    /^er-(.+)-\d+$/,
    /^node-(.+)$/,
    /^pie-(.+)-\d+$/,
  ];

  for (const pattern of patterns) {
    const match = id.match(pattern);
    if (match) return match[1];
  }

  return id || null;
}

function collectTextContent(textEl) {
  const tspans = textEl.querySelectorAll('tspan');
  if (tspans.length) {
    return Array.from(tspans).map((t) => t.textContent).join('\n');
  }
  return textEl.textContent;
}

function findLabelContainer(el) {
  let cur = el.parentElement;
  while (cur) {
    if (cur.classList?.contains('node')) return { kind: 'node', el: cur };
    if (cur.classList?.contains('cluster')) return { kind: 'cluster', el: cur };
    if (cur.classList?.contains('actor')) return { kind: 'actor', el: cur };
    if (cur.classList?.contains('participant')) return { kind: 'participant', el: cur };
    if (cur.classList?.contains('label')) {
      const parent = cur.parentElement;
      if (parent?.classList?.contains('node')) return { kind: 'node', el: parent };
      if (parent?.classList?.contains('cluster')) return { kind: 'cluster', el: parent };
    }
    cur = cur.parentElement;
  }
  return null;
}

function resolveLabelTarget(target, svg) {
  let el = target;
  while (el && el !== svg) {
    if (el.tagName === 'foreignObject') {
      const container = findLabelContainer(el);
      if (!container) return null;
      return {
        kind: container.kind,
        containerEl: container.el,
        nodeKey: extractNodeKey(container.el, container.kind),
        oldText: normalizeLabelText(el.textContent),
        labelRect: el.getBoundingClientRect(),
      };
    }

    if (el.tagName === 'text' || el.tagName === 'tspan') {
      const textGroup = el.closest('text') || el;
      const container = findLabelContainer(textGroup);
      if (!container) return null;
      const labelText = collectTextContent(textGroup);
      if (!labelText) return null;
      return {
        kind: container.kind,
        containerEl: container.el,
        nodeKey: extractNodeKey(container.el, container.kind),
        oldText: normalizeLabelText(labelText),
        labelRect: textGroup.getBoundingClientRect(),
      };
    }

    el = el.parentElement;
  }
  return null;
}

function isPickContainer(el) {
  if (!el?.classList) return false;
  return el.classList.contains('node')
    || el.classList.contains('cluster')
    || el.classList.contains('actor')
    || el.classList.contains('participant')
    || el.classList.contains('edgePath')
    || el.classList.contains('edgeLabel');
}

export function buildLabelMetaFromContainer(containerEl, svg) {
  if (!containerEl || !svg) return null;

  const foreignObject = containerEl.querySelector('foreignObject');
  if (foreignObject) {
    return resolveLabelTarget(foreignObject, svg);
  }

  const text = containerEl.querySelector('.label text') || containerEl.querySelector('text');
  if (text) {
    return resolveLabelTarget(text, svg);
  }

  if (containerEl.classList.contains('edgeLabel')) {
    return resolveLabelTarget(containerEl, svg);
  }

  return resolveLabelTarget(containerEl, svg);
}

function closeEditor() {
  if (activeEditor) {
    activeEditor.remove();
    activeEditor = null;
  }
  editing = false;
  activeSvg?.closest('.preview-viewport')?.classList.remove('is-editing-label');
}

function commitEdit({ getSource, setSource, showStatus }, meta, newText) {
  if (committing) return;
  committing = true;

  const trimmed = newText.trim();
  if (!trimmed || trimmed === meta.oldText) {
    closeEditor();
    committing = false;
    return;
  }

  const patched = patchLabel(getSource(), {
    nodeKey: meta.nodeKey,
    oldText: meta.oldText,
    newText: trimmed,
    kind: meta.kind,
  });

  closeEditor();

  if (!patched) {
    showStatus('此元素暂不支持预览编辑', true);
    committing = false;
    return;
  }

  setSource(patched);
  showStatus('已更新源码');
  committing = false;
}

function openEditor(previewEl, meta, handlers) {
  closeEditor();
  editing = true;
  previewEl.classList.add('is-editing-label');

  const previewRect = previewEl.getBoundingClientRect();
  const editor = document.createElement('textarea');
  editor.className = 'preview-label-editor';
  editor.value = meta.oldText;
  editor.rows = Math.min(6, Math.max(1, meta.oldText.split('\n').length));
  editor.style.left = `${meta.labelRect.left - previewRect.left}px`;
  editor.style.top = `${meta.labelRect.top - previewRect.top}px`;
  editor.style.minWidth = `${Math.max(meta.labelRect.width, 120)}px`;
  editor.style.minHeight = `${Math.max(meta.labelRect.height, 28)}px`;

  editor.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commitEdit(handlers, meta, editor.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
    }
  });

  editor.addEventListener('blur', () => {
    commitEdit(handlers, meta, editor.value);
  });

  editor.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  previewEl.appendChild(editor);
  activeEditor = editor;
  editor.focus();
  editor.select();
}

export function openEditorForTarget(svg, previewEl, targetEl, handlers) {
  if (!svg || !previewEl || !targetEl) return false;

  const meta = isPickContainer(targetEl)
    ? buildLabelMetaFromContainer(targetEl, svg)
    : resolveLabelTarget(targetEl, svg);

  if (!meta?.nodeKey || !meta.oldText) {
    handlers.showStatus('此元素暂不支持预览编辑', true);
    return false;
  }

  openEditor(previewEl, meta, handlers);
  return true;
}

export function detachLabelEditing(svg) {
  const target = svg || activeSvg;
  if (target && dblClickHandler) {
    target.removeEventListener('dblclick', dblClickHandler);
  }
  activeSvg = null;
  dblClickHandler = null;
  closeEditor();
}

export function attachLabelEditing(svg, previewEl, handlers) {
  detachLabelEditing(svg);
  if (!svg || !previewEl) return;

  activeSvg = svg;
  dblClickHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openEditorForTarget(svg, previewEl, event.target, handlers);
  };

  svg.addEventListener('dblclick', dblClickHandler);
}
