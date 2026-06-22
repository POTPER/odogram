import mermaid from 'mermaid';
import { ctx } from './app-context.js';
import { parseDiagramFormat } from './format.js';
import { attachLabelEditing, detachLabelEditing, isLabelEditBlockingPan } from './preview-label-edit.js';
import { attachSelection, detachSelection } from './preview-selection.js';
import {
  renderOproductPreview,
  detachOproductPreview,
  initOproductViewSwitcher,
} from './oproduct-preview.js';
import {
  isPreviewPanning,
  initPreviewViewport,
  getPreviewSvg,
  fitPreview,
  clearViewBoxState,
  setBaseViewBoxFromSvg,
  setMermaidZoomControlsEnabled,
  setOproductScrollMode,
} from './preview-viewport.js';
import { isPreviewLoadingActive, setPreviewLoadingPhase } from './preview-loading.js';

const preview = document.getElementById('preview');
const previewCanvas = document.getElementById('preview-canvas');
const zoomLabel = document.getElementById('zoom-label');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const btnZoomReset = document.getElementById('btn-zoom-reset');

let renderTimer = null;
let renderSeq = 0;
let renderSettledPromise = Promise.resolve();
let isOproductMode = false;
let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;
let onRenderSuccessFn = () => {};
let getSourceFn = () => '';
let setSourceFn = () => {};
let readOnly = false;
let viewBoxReady = false;
let readOnlyResizeObserver = null;

export { isPreviewPanning };

function getPreviewHandlers() {
  return {
    getSource: getSourceFn,
    setSource: setSourceFn,
    showStatus: showStatusFn,
  };
}

function detachPreviewInteraction(svg) {
  detachLabelEditing(svg);
  detachSelection(svg);
}

function attachPreviewInteraction(svgEl) {
  if (readOnly) return;
  const handlers = getPreviewHandlers();
  attachLabelEditing(svgEl, preview, handlers);
  attachSelection(svgEl, preview, handlers, isPreviewPanning);
}

function applyViewBoxWhenReady(svgEl) {
  const apply = () => {
    if (preview.clientWidth < 1 || preview.clientHeight < 1) {
      requestAnimationFrame(apply);
      return;
    }
    setBaseViewBoxFromSvg(svgEl);
    setMermaidZoomControlsEnabled(true);
    viewBoxReady = true;
  };
  requestAnimationFrame(apply);
}

function setupReadOnlyViewportObserver() {
  if (!readOnly || readOnlyResizeObserver || !preview) return;
  readOnlyResizeObserver = new ResizeObserver(() => {
    if (!viewBoxReady || preview.clientWidth < 1 || preview.clientHeight < 1) return;
    fitPreview();
  });
  readOnlyResizeObserver.observe(preview);
}

function setOproductPreviewMode(enabled) {
  isOproductMode = enabled;
  document.body.classList.toggle('is-oproduct', enabled);
  setOproductScrollMode(enabled);
}

function setPreviewInteractionsEnabled(enabled) {
  if (isOproductMode) {
    setOproductPreviewMode(enabled);
    return;
  }
  setMermaidZoomControlsEnabled(enabled);
}

function clearPreviewCanvas() {
  previewCanvas.innerHTML = '';
  detachPreviewInteraction(null);
  detachOproductPreview();
  ctx.lastSvg = '';
  clearViewBoxState();
  setOproductPreviewMode(false);
  setMermaidZoomControlsEnabled(false);
}

async function renderPreview() {
  const code = getSourceFn().trim();
  const seq = ++renderSeq;
  let settleRender;
  renderSettledPromise = new Promise((resolve) => {
    settleRender = resolve;
  });

  if (isPreviewLoadingActive()) {
    setPreviewLoadingPhase('render');
  }

  try {
    if (!code) {
      clearPreviewCanvas();
      return;
    }

    const format = parseDiagramFormat(code);

    if (format === 'oproduct') {
      detachPreviewInteraction(getPreviewSvg());
      ctx.lastSvg = '';
      clearViewBoxState();

      const result = renderOproductPreview({
        code,
        container: previewCanvas,
        escapeHtml: escapeHtmlFn,
        ...(readOnly
          ? {}
          : { getSource: getSourceFn, setSource: setSourceFn }),
      });

      if (seq !== renderSeq) return;

      setOproductPreviewMode(result.ok);
      if (result.ok) {
        onRenderSuccessFn();
      }
      return;
    }

    detachOproductPreview();
    setOproductPreviewMode(false);

    const renderId = `diagram-${Date.now()}-${seq}`;
    try {
      const { svg } = await mermaid.render(renderId, code);
      if (seq !== renderSeq) return;
      detachPreviewInteraction(getPreviewSvg());
      previewCanvas.innerHTML = svg;
      ctx.lastSvg = svg;

      const svgEl = getPreviewSvg();
      if (svgEl) {
        if (readOnly) {
          viewBoxReady = false;
          applyViewBoxWhenReady(svgEl);
        } else {
          setBaseViewBoxFromSvg(svgEl);
          attachPreviewInteraction(svgEl);
          setMermaidZoomControlsEnabled(true);
        }
      } else if (!readOnly) {
        setMermaidZoomControlsEnabled(true);
      }
      onRenderSuccessFn();
    } catch (err) {
      if (seq !== renderSeq) return;
      previewCanvas.innerHTML = `<div class="preview-error">${escapeHtmlFn(String(err.message || err))}</div>`;
      detachPreviewInteraction(null);
      ctx.lastSvg = '';
      clearViewBoxState();
      setMermaidZoomControlsEnabled(false);
    }
  } finally {
    if (seq === renderSeq) {
      settleRender();
    }
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    void renderPreview();
  }, 300);
}

async function renderPreviewNow() {
  clearTimeout(renderTimer);
  renderTimer = null;
  await renderPreview();
}

function waitForPreviewSettled() {
  return renderSettledPromise;
}

function downloadSvg() {
  if (parseDiagramFormat(ctx.editor?.getValue() ?? '') === 'oproduct') {
    showStatusFn('SVG export is only available for Mermaid diagrams', true);
    return;
  }

  if (!ctx.lastSvg) {
    showStatusFn('Nothing to download — fix preview errors first', true);
    return;
  }

  const blob = new Blob([ctx.lastSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ctx.currentId || 'diagram'}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  showStatusFn('SVG downloaded');
}

export function initPreview({
  showStatus,
  escapeHtml,
  onRenderSuccess,
  getSource,
  setSource,
  readOnly: readOnlyMode = false,
} = {}) {
  showStatusFn = showStatus;
  escapeHtmlFn = escapeHtml;
  onRenderSuccessFn = onRenderSuccess || (() => {});
  getSourceFn = getSource || (() => '');
  setSourceFn = setSource || (() => {});
  readOnly = readOnlyMode;

  initPreviewViewport({
    preview,
    previewCanvas,
    zoomLabel,
    btnZoomIn,
    btnZoomOut,
    btnZoomFit,
    btnZoomReset,
    isLabelEditBlockingPan: readOnly ? undefined : isLabelEditBlockingPan,
  });
  initOproductViewSwitcher(previewCanvas);
  setupReadOnlyViewportObserver();

  return {
    scheduleRender,
    renderPreviewNow,
    waitForPreviewSettled,
    clearPreviewCanvas,
    getPreviewSvg,
    fitPreview,
    downloadSvg,
  };
}
