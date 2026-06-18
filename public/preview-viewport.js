const PREVIEW_MIN_SCALE = 0.1;
const PREVIEW_MAX_SCALE = 5;
const PAN_THRESHOLD = 3;

let previewEl = null;
let previewCanvasEl = null;
let zoomLabelEl = null;
let btnZoomInEl = null;
let btnZoomOutEl = null;
let btnZoomFitEl = null;
let btnZoomResetEl = null;
let isLabelEditBlockingPanFn = () => false;

let baseViewBox = null;
let currentViewBox = null;
let previewPanning = false;
let panActive = false;
let panPointerId = null;
let panStart = { x: 0, y: 0 };
let previewLastPointer = { x: 0, y: 0 };
let previewPinchDistance = 0;

export function isPreviewPanning() {
  return previewPanning;
}

export function getPreviewSvg() {
  return previewCanvasEl?.querySelector('svg') ?? null;
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

export function normalizeSvg(svg) {
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
  if (!zoomLabelEl) return;
  zoomLabelEl.textContent = `${Math.round(getPreviewScale() * 100)}%`;
}

export function clearViewBoxState() {
  baseViewBox = null;
  currentViewBox = null;
  updateZoomLabel();
}

export function fitPreview() {
  if (!baseViewBox) return;
  applyViewBox(cloneViewBox(baseViewBox));
}

function resetPreviewView() {
  fitPreview();
}

function zoomPreviewBy(factor, anchorX, anchorY) {
  if (!currentViewBox || !baseViewBox || !previewEl) return;

  const scaleBefore = getPreviewScale();
  const scaleAfter = clampPreviewScale(scaleBefore * factor);
  if (scaleAfter === scaleBefore) return;

  const actualFactor = scaleAfter / scaleBefore;
  const vb = currentViewBox;
  const w = Math.max(previewEl.clientWidth, 1);
  const h = Math.max(previewEl.clientHeight, 1);

  const sx = vb.x + (anchorX / w) * vb.width;
  const sy = vb.y + (anchorY / h) * vb.height;
  const newW = vb.width / actualFactor;
  const newH = vb.height / actualFactor;
  const newX = sx - (anchorX / w) * newW;
  const newY = sy - (anchorY / h) * newH;

  applyViewBox({ x: newX, y: newY, width: newW, height: newH });
}

function panPreviewBy(dx, dy) {
  if (!currentViewBox || !previewEl) return;

  const w = Math.max(previewEl.clientWidth, 1);
  const h = Math.max(previewEl.clientHeight, 1);
  const vb = currentViewBox;

  applyViewBox({
    x: vb.x - (dx * vb.width) / w,
    y: vb.y - (dy * vb.height) / h,
    width: vb.width,
    height: vb.height,
  });
}

function getPreviewPoint(clientX, clientY) {
  const rect = previewEl.getBoundingClientRect();
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

export function setMermaidZoomControlsEnabled(enabled) {
  if (!btnZoomInEl) return;
  btnZoomInEl.disabled = !enabled;
  btnZoomOutEl.disabled = !enabled;
  btnZoomFitEl.disabled = !enabled;
  btnZoomResetEl.disabled = !enabled;
  previewEl?.classList.toggle('preview-disabled', !enabled);
}

export function setOproductScrollMode(enabled) {
  if (!previewEl) return;
  previewEl.classList.remove('preview-disabled', 'is-panning');
  previewEl.classList.toggle('is-oproduct-scroll', enabled);
  if (zoomLabelEl) zoomLabelEl.textContent = '—';
  setMermaidZoomControlsEnabled(false);
}

export function setBaseViewBoxFromSvg(svg) {
  baseViewBox = normalizeSvg(svg);
  fitPreview();
}

export function initPreviewViewport({
  preview,
  previewCanvas,
  zoomLabel,
  btnZoomIn,
  btnZoomOut,
  btnZoomFit,
  btnZoomReset,
  isLabelEditBlockingPan,
}) {
  previewEl = preview;
  previewCanvasEl = previewCanvas;
  zoomLabelEl = zoomLabel;
  btnZoomInEl = btnZoomIn;
  btnZoomOutEl = btnZoomOut;
  btnZoomFitEl = btnZoomFit;
  btnZoomResetEl = btnZoomReset;
  isLabelEditBlockingPanFn = isLabelEditBlockingPan || (() => false);

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
    if (isLabelEditBlockingPanFn()) return;

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
