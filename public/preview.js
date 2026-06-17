import mermaid from 'mermaid';
import { ctx } from './app-context.js';

const preview = document.getElementById('preview');
const previewCanvas = document.getElementById('preview-canvas');
const zoomLabel = document.getElementById('zoom-label');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const btnZoomReset = document.getElementById('btn-zoom-reset');

const PREVIEW_PADDING = 24;
const PREVIEW_MIN_SCALE = 0.1;
const PREVIEW_MAX_SCALE = 5;

let previewScale = 1;
let previewPanX = 0;
let previewPanY = 0;
let previewPanning = false;
let previewLastPointer = { x: 0, y: 0 };
let previewPinchDistance = 0;
let renderTimer = null;
let renderSeq = 0;
let showStatusFn = () => {};
let escapeHtmlFn = (str) => str;

function getPreviewSvg() {
  return previewCanvas.querySelector('svg');
}

function setPreviewInteractionsEnabled(enabled) {
  btnZoomIn.disabled = !enabled;
  btnZoomOut.disabled = !enabled;
  btnZoomFit.disabled = !enabled;
  btnZoomReset.disabled = !enabled;
  preview.classList.toggle('preview-disabled', !enabled);
}

function applyPreviewTransform() {
  previewCanvas.style.transform = `translate(${previewPanX}px, ${previewPanY}px) scale(${previewScale})`;
  updateZoomLabel();
}

function updateZoomLabel() {
  zoomLabel.textContent = `${Math.round(previewScale * 100)}%`;
}

function clampPreviewScale(scale) {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, scale));
}

function getSvgSize(svg) {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox?.width && viewBox?.height) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const width = parseFloat(svg.getAttribute('width'));
  const height = parseFloat(svg.getAttribute('height'));
  if (width && height) {
    return { width, height };
  }

  const bbox = svg.getBBox();
  return { width: bbox.width, height: bbox.height };
}

function fitPreview() {
  const svg = getPreviewSvg();
  if (!svg) return;

  const { width, height } = getSvgSize(svg);
  if (!width || !height) return;

  const viewportWidth = preview.clientWidth;
  const viewportHeight = preview.clientHeight;
  const availableWidth = Math.max(viewportWidth - PREVIEW_PADDING * 2, 1);
  const availableHeight = Math.max(viewportHeight - PREVIEW_PADDING * 2, 1);

  previewScale = clampPreviewScale(Math.min(availableWidth / width, availableHeight / height));
  previewPanX = (viewportWidth - width * previewScale) / 2;
  previewPanY = (viewportHeight - height * previewScale) / 2;
  applyPreviewTransform();
}

function resetPreviewView() {
  const svg = getPreviewSvg();
  if (!svg) return;

  const { width, height } = getSvgSize(svg);
  previewScale = 1;
  previewPanX = (preview.clientWidth - width) / 2;
  previewPanY = (preview.clientHeight - height) / 2;
  applyPreviewTransform();
}

function zoomPreviewBy(factor, anchorX, anchorY) {
  if (!getPreviewSvg()) return;

  const nextScale = clampPreviewScale(previewScale * factor);
  if (nextScale === previewScale) return;

  const worldX = (anchorX - previewPanX) / previewScale;
  const worldY = (anchorY - previewPanY) / previewScale;
  previewScale = nextScale;
  previewPanX = anchorX - worldX * previewScale;
  previewPanY = anchorY - worldY * previewScale;
  applyPreviewTransform();
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
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const point = getPreviewPoint(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomPreviewBy(factor, point.x, point.y);
  }, { passive: false });

  preview.addEventListener('pointerdown', (event) => {
    if (!getPreviewSvg() || event.button !== 0) return;

    previewPanning = true;
    previewLastPointer = { x: event.clientX, y: event.clientY };
    preview.classList.add('is-panning');
    preview.setPointerCapture(event.pointerId);
  });

  preview.addEventListener('pointermove', (event) => {
    if (!previewPanning) return;

    previewPanX += event.clientX - previewLastPointer.x;
    previewPanY += event.clientY - previewLastPointer.y;
    previewLastPointer = { x: event.clientX, y: event.clientY };
    applyPreviewTransform();
  });

  function stopPanning(event) {
    if (!previewPanning) return;
    previewPanning = false;
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
    ctx.lastSvg = '';
    previewScale = 1;
    previewPanX = 0;
    previewPanY = 0;
    applyPreviewTransform();
    setPreviewInteractionsEnabled(false);
    return;
  }

  const renderId = `diagram-${Date.now()}-${seq}`;
  try {
    const { svg } = await mermaid.render(renderId, code);
    if (seq !== renderSeq) return;
    previewCanvas.innerHTML = svg;
    ctx.lastSvg = svg;
    setPreviewInteractionsEnabled(true);
    fitPreview();
  } catch (err) {
    if (seq !== renderSeq) return;
    previewCanvas.innerHTML = `<div class="preview-error">${escapeHtmlFn(String(err.message || err))}</div>`;
    ctx.lastSvg = '';
    setPreviewInteractionsEnabled(false);
    updateZoomLabel();
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 300);
}

function downloadSvg() {
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

export function initPreview({ showStatus, escapeHtml }) {
  showStatusFn = showStatus;
  escapeHtmlFn = escapeHtml;
  initPreviewViewport();

  return {
    scheduleRender,
    getPreviewSvg,
    fitPreview,
    downloadSvg,
  };
}
