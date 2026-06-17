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

const preview = document.getElementById('preview');
const previewCanvas = document.getElementById('preview-canvas');
const zoomLabel = document.getElementById('zoom-label');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const btnZoomReset = document.getElementById('btn-zoom-reset');

const PREVIEW_MIN_SCALE = 0.1;
const PREVIEW_MAX_SCALE = 5;
const PAN_THRESHOLD = 3;

let baseViewBox = null;
let currentViewBox = null;
let previewPanning = false;
let panActive = false;
let panPointerId = null;
let panStart = { x: 0, y: 0 };
let previewLastPointer = { x: 0, y: 0 };
let previewPinchDistance = 0;
let renderTimer = null;
let renderSeq = 0;
let isOproductMode = false;
let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;
let onRenderSuccessFn = () => {};
let getSourceFn = () => '';
let setSourceFn = () => {};

export function isPreviewPanning() {
  return previewPanning;
}

function getPreviewSvg() {
  return previewCanvas.querySelector('svg');
}

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
  const handlers = getPreviewHandlers();
  attachLabelEditing(svgEl, preview, handlers);
  attachSelection(svgEl, preview, handlers, isPreviewPanning);
}

function setMermaidInteractionsEnabled(enabled) {
  btnZoomIn.disabled = !enabled;
  btnZoomOut.disabled = !enabled;
  btnZoomFit.disabled = !enabled;
  btnZoomReset.disabled = !enabled;
  preview.classList.toggle('preview-disabled', !enabled);
}

function setOproductPreviewMode(enabled) {
  isOproductMode = enabled;
  document.body.classList.toggle('is-oproduct', enabled);
  btnZoomIn.disabled = true;
  btnZoomOut.disabled = true;
  btnZoomFit.disabled = true;
  btnZoomReset.disabled = true;
  zoomLabel.textContent = '—';
  preview.classList.remove('preview-disabled', 'is-panning');
  preview.classList.toggle('is-oproduct-scroll', enabled);
}

function setPreviewInteractionsEnabled(enabled) {
  if (isOproductMode) {
    setOproductPreviewMode(enabled);
    return;
  }
  setMermaidInteractionsEnabled(enabled);
}

function cloneViewBox(vb) {
  return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
}

function readViewBoxFromSvg(svg) {
  const vb = svg.viewBox?.baseVal;
  if (vb?.width && vb?.height) {
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  }

  const width = parseFloat(svg.getAttribute('width'));
  const height = parseFloat(svg.getAttribute('height'));
  if (width && height) {
    return { x: 0, y: 0, width, height };
  }

  const bbox = svg.getBBox();
  return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
}

function normalizeSvg(svg) {
  const vb = readViewBoxFromSvg(svg);
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.display = 'block';
  return vb;
}

function applyViewBox(vb) {
  const svg = getPreviewSvg();
  if (!svg || !vb?.width || !vb?.height) return;

  currentViewBox = cloneViewBox(vb);
  svg.setAttribute(
    'viewBox',
    `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`,
  );
  updateZoomLabel();
}

function getPreviewScale() {
  if (!baseViewBox?.width || !currentViewBox?.width) return 1;
  return baseViewBox.width / currentViewBox.width;
}

function clampPreviewScale(scale) {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, scale));
}

function updateZoomLabel() {
  zoomLabel.textContent = `${Math.round(getPreviewScale() * 100)}%`;
}

function clearViewBoxState() {
  baseViewBox = null;
  currentViewBox = null;
  updateZoomLabel();
}

function fitPreview() {
  if (!baseViewBox) return;
  applyViewBox(cloneViewBox(baseViewBox));
}

function resetPreviewView() {
  fitPreview();
}

function zoomPreviewBy(factor, anchorX, anchorY) {
  if (!currentViewBox || !baseViewBox) return;

  const scaleBefore = getPreviewScale();
  const scaleAfter = clampPreviewScale(scaleBefore * factor);
  if (scaleAfter === scaleBefore) return;

  const actualFactor = scaleAfter / scaleBefore;
  const vb = currentViewBox;
  const w = Math.max(preview.clientWidth, 1);
  const h = Math.max(preview.clientHeight, 1);

  const sx = vb.x + (anchorX / w) * vb.width;
  const sy = vb.y + (anchorY / h) * vb.height;
  const newW = vb.width / actualFactor;
  const newH = vb.height / actualFactor;
  const newX = sx - (anchorX / w) * newW;
  const newY = sy - (anchorY / h) * newH;

  applyViewBox({ x: newX, y: newY, width: newW, height: newH });
}

function panPreviewBy(dx, dy) {
  if (!currentViewBox) return;

  const w = Math.max(preview.clientWidth, 1);
  const h = Math.max(preview.clientHeight, 1);
  const vb = currentViewBox;

  applyViewBox({
    x: vb.x - (dx * vb.width) / w,
    y: vb.y - (dy * vb.height) / h,
    width: vb.width,
    height: vb.height,
  });
}

function getPreviewPoint(clientX, clientY) {
  const rect = preview.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touches) {
  return getPreviewPoint(
    (touches[0].clientX + touches[1].clientX) / 2,
    (touches[0].clientY + touches[1].clientY) / 2,
  );
}

function initPreviewViewport() {
  btnZoomIn.addEventListener('click', () => {
    zoomPreviewBy(1.25, preview.clientWidth / 2, preview.clientHeight / 2);
  });

  btnZoomOut.addEventListener('click', () => {
    zoomPreviewBy(0.8, preview.clientWidth / 2, preview.clientHeight / 2);
  });

  btnZoomFit.addEventListener('click', fitPreview);
  btnZoomReset.addEventListener('click', resetPreviewView);

  preview.addEventListener('wheel', (event) => {
    if (!getPreviewSvg()) return;

    event.preventDefault();
    const point = getPreviewPoint(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomPreviewBy(factor, point.x, point.y);
  }, { passive: false });

  preview.addEventListener('pointerdown', (event) => {
    if (!getPreviewSvg()) return;
    if (event.button !== 1 && event.button !== 2) return;
    if (isLabelEditBlockingPan()) return;

    event.preventDefault();
    panActive = true;
    previewPanning = false;
    panPointerId = event.pointerId;
    panStart = { x: event.clientX, y: event.clientY };
    previewLastPointer = { x: event.clientX, y: event.clientY };
    preview.setPointerCapture(event.pointerId);
  });

  preview.addEventListener('pointermove', (event) => {
    if (!panActive || event.pointerId !== panPointerId) return;

    const dx = event.clientX - panStart.x;
    const dy = event.clientY - panStart.y;
    if (!previewPanning && Math.hypot(dx, dy) >= PAN_THRESHOLD) {
      previewPanning = true;
      preview.classList.add('is-panning');
    }
    if (!previewPanning) return;

    const mdx = event.clientX - previewLastPointer.x;
    const mdy = event.clientY - previewLastPointer.y;
    previewLastPointer = { x: event.clientX, y: event.clientY };
    panPreviewBy(mdx, mdy);
  });

  function stopPanning(event) {
    if (!panActive || event.pointerId !== panPointerId) return;

    panActive = false;
    previewPanning = false;
    panPointerId = null;
    preview.classList.remove('is-panning');
    if (preview.hasPointerCapture(event.pointerId)) {
      preview.releasePointerCapture(event.pointerId);
    }
  }

  preview.addEventListener('pointerup', stopPanning);
  preview.addEventListener('pointercancel', stopPanning);

  preview.addEventListener('touchstart', (event) => {
    if (!getPreviewSvg() || event.touches.length !== 2) return;

    previewPinchDistance = getTouchDistance(event.touches);
  }, { passive: true });

  preview.addEventListener('touchmove', (event) => {
    if (!getPreviewSvg() || event.touches.length !== 2 || !previewPinchDistance) return;

    event.preventDefault();
    const distance = getTouchDistance(event.touches);
    const center = getTouchCenter(event.touches);
    const factor = distance / previewPinchDistance;
    if (factor !== 1) {
      zoomPreviewBy(factor, center.x, center.y);
    }
    previewPinchDistance = distance;
  }, { passive: false });

  preview.addEventListener('touchend', (event) => {
    if (event.touches.length < 2) {
      previewPinchDistance = 0;
    }
  });
}

async function renderPreview() {
  const code = ctx.editor.getValue().trim();
  const seq = ++renderSeq;

  if (!code) {
    previewCanvas.innerHTML = '';
    detachPreviewInteraction(null);
    detachOproductPreview();
    ctx.lastSvg = '';
    clearViewBoxState();
    setOproductPreviewMode(false);
    setMermaidInteractionsEnabled(false);
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
      baseViewBox = normalizeSvg(svgEl);
      fitPreview();
      attachPreviewInteraction(svgEl);
    }

    setMermaidInteractionsEnabled(true);
    onRenderSuccessFn();
  } catch (err) {
    if (seq !== renderSeq) return;
    previewCanvas.innerHTML = `<div class="preview-error">${escapeHtmlFn(String(err.message || err))}</div>`;
    detachPreviewInteraction(null);
    ctx.lastSvg = '';
    clearViewBoxState();
    setMermaidInteractionsEnabled(false);
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 300);
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
} = {}) {
  showStatusFn = showStatus;
  escapeHtmlFn = escapeHtml;
  onRenderSuccessFn = onRenderSuccess || (() => {});
  getSourceFn = getSource || (() => '');
  setSourceFn = setSource || (() => {});
  initPreviewViewport();
  initOproductViewSwitcher(previewCanvas);

  return {
    scheduleRender,
    getPreviewSvg,
    fitPreview,
    downloadSvg,
  };
}
