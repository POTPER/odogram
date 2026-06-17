import { openEditorForTarget } from './preview-label-edit.js';

const PICK_THRESHOLD = 3;

let activeSvg = null;
let activePreview = null;
let activeHandlers = null;
let isPreviewPanningFn = () => false;
let selectedEl = null;
let pickStart = null;
let pickPointerId = null;
let pointerDownHandler = null;
let pointerUpHandler = null;
let keyDownHandler = null;

function resolvePickTarget(target, svg) {
  let el = target;
  while (el && el !== svg) {
    if (el.classList?.contains('node')) return el;
    if (el.classList?.contains('cluster')) return el;
    if (el.classList?.contains('edgePath')) return el;
    if (el.classList?.contains('edgeLabel')) return el;
    if (el.classList?.contains('actor')) return el;
    if (el.classList?.contains('participant')) return el;
    if (el.tagName === 'path' && el.classList?.contains('flowchart-link')) {
      return el.closest('.edgePath') || el.parentElement;
    }
    el = el.parentElement;
  }
  return null;
}

function clearSelection() {
  if (selectedEl) {
    selectedEl.classList.remove('is-preview-selected');
    selectedEl = null;
  }
}

function selectElement(el) {
  clearSelection();
  if (!el) return;
  selectedEl = el;
  selectedEl.classList.add('is-preview-selected');
}

export function getSelectedElement() {
  return selectedEl;
}

function handlePick(event) {
  if (!activeSvg || isPreviewPanningFn()) return;

  const pickTarget = resolvePickTarget(event.target, activeSvg);
  if (pickTarget) {
    selectElement(pickTarget);
    return;
  }

  if (event.target === activeSvg || activeSvg.contains(event.target)) {
    clearSelection();
  }
}

function onPointerDown(event) {
  if (event.button !== 0 || !activeSvg) return;
  pickStart = { x: event.clientX, y: event.clientY };
  pickPointerId = event.pointerId;
}

function onPointerUp(event) {
  if (event.button !== 0 || pickPointerId !== event.pointerId || !pickStart) return;

  const dx = event.clientX - pickStart.x;
  const dy = event.clientY - pickStart.y;
  const moved = Math.hypot(dx, dy);
  pickStart = null;
  pickPointerId = null;

  if (moved >= PICK_THRESHOLD || isPreviewPanningFn()) return;
  handlePick(event);
}

function onKeyDown(event) {
  if (!activeSvg || !selectedEl) return;
  if (event.target.closest('.preview-label-editor')) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    clearSelection();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    openEditorForTarget(activeSvg, activePreview, selectedEl, activeHandlers);
  }
}

export function detachSelection(_svg) {
  if (activePreview && pointerDownHandler) {
    activePreview.removeEventListener('pointerdown', pointerDownHandler);
    activePreview.removeEventListener('pointerup', pointerUpHandler);
  }
  if (keyDownHandler) {
    window.removeEventListener('keydown', keyDownHandler);
  }

  clearSelection();
  activeSvg = null;
  activePreview = null;
  activeHandlers = null;
  isPreviewPanningFn = () => false;
  pickStart = null;
  pickPointerId = null;
  pointerDownHandler = null;
  pointerUpHandler = null;
  keyDownHandler = null;
}

export function attachSelection(svg, previewEl, handlers, isPreviewPanning) {
  detachSelection(svg);
  if (!svg || !previewEl) return;

  activeSvg = svg;
  activePreview = previewEl;
  activeHandlers = handlers;
  isPreviewPanningFn = isPreviewPanning || (() => false);

  pointerDownHandler = onPointerDown;
  pointerUpHandler = onPointerUp;
  keyDownHandler = onKeyDown;

  previewEl.addEventListener('pointerdown', pointerDownHandler);
  previewEl.addEventListener('pointerup', pointerUpHandler);
  window.addEventListener('keydown', keyDownHandler);
}
