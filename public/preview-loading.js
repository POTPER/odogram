const SHOW_DELAY_MS = 300;

const PHASE_TARGETS = {
  fetch: 40,
  render: 92,
  done: 100,
};

export const PREVIEW_LOADING_HTML = `<div class="preview-loading" role="status" aria-live="polite">
  <div class="preview-loading-panel">
    <div class="preview-loading-bar"><div class="preview-loading-fill"></div></div>
    <span class="preview-loading-label">Loading diagram…</span>
  </div>
</div>`;

let refCount = 0;
let rafId = null;
let hideTimer = null;
let showTimer = null;
let overlayVisible = false;
let currentProgress = 0;
let targetProgress = 15;
let overlayEl = null;
let fillEl = null;
let labelEl = null;
let hostEl = null;
let pendingLabel = 'Loading diagram…';
let pendingHost = null;

function resolveHost(container) {
  if (container) return container;
  return document.getElementById('preview') || document.body;
}

function findExistingOverlay(host) {
  return host.querySelector('.preview-loading');
}

function ensureOverlay(host) {
  const existing = findExistingOverlay(host);
  if (existing) {
    overlayEl = existing;
    fillEl = existing.querySelector('.preview-loading-fill');
    labelEl = existing.querySelector('.preview-loading-label');
    hostEl = host;
    return;
  }

  hostEl = host;
  host.insertAdjacentHTML('beforeend', PREVIEW_LOADING_HTML);
  overlayEl = host.querySelector('.preview-loading');
  fillEl = overlayEl.querySelector('.preview-loading-fill');
  labelEl = overlayEl.querySelector('.preview-loading-label');
}

function setFillWidth(value) {
  if (!fillEl) return;
  fillEl.style.width = `${Math.min(100, Math.max(0, value))}%`;
}

function clearShowTimer() {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

function stopAnimation() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tick() {
  if (!overlayEl) return;

  currentProgress += (targetProgress - currentProgress) * 0.12;
  if (Math.abs(targetProgress - currentProgress) < 0.4) {
    currentProgress = targetProgress;
  }
  setFillWidth(currentProgress);

  if (refCount > 0 || currentProgress < 100) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
    overlayEl.classList.add('preview-loading--hiding');
    hideTimer = window.setTimeout(() => {
      overlayEl?.classList.remove('preview-loading--visible', 'preview-loading--hiding');
      overlayVisible = false;
      hideTimer = null;
    }, 220);
  }
}

function revealOverlay() {
  if (refCount === 0) return;

  const host = pendingHost || hostEl || resolveHost();
  ensureOverlay(host);
  if (labelEl) labelEl.textContent = pendingLabel;

  overlayVisible = true;
  currentProgress = Math.max(currentProgress, 5);
  setFillWidth(currentProgress);

  stopAnimation();
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  overlayEl?.classList.remove('preview-loading--hiding');
  overlayEl?.classList.add('preview-loading--visible');
  rafId = requestAnimationFrame(tick);
}

function scheduleReveal() {
  clearShowTimer();
  showTimer = window.setTimeout(() => {
    showTimer = null;
    if (refCount > 0) {
      revealOverlay();
    }
  }, SHOW_DELAY_MS);
}

export function isPreviewLoadingActive() {
  return refCount > 0;
}

export function beginPreviewLoading(label = 'Loading diagram…', container) {
  pendingLabel = label;
  pendingHost = resolveHost(container);

  refCount += 1;
  if (refCount === 1) {
    currentProgress = 5;
    targetProgress = 15;
    overlayVisible = false;
    scheduleReveal();
  } else if (labelEl) {
    labelEl.textContent = label;
  }
}

export function setPreviewLoadingPhase(phase) {
  if (refCount === 0) return;
  targetProgress = PHASE_TARGETS[phase] ?? targetProgress;
  if (overlayVisible && !rafId) {
    rafId = requestAnimationFrame(tick);
  }
}

export function endPreviewLoading() {
  if (refCount === 0) return;

  refCount -= 1;
  clearShowTimer();

  if (refCount > 0) return;

  if (!overlayVisible) {
    pendingHost = null;
    return;
  }

  targetProgress = PHASE_TARGETS.done;
  currentProgress = Math.max(currentProgress, 95);
  if (!rafId) {
    rafId = requestAnimationFrame(tick);
  }
}

export function initPreviewLoadingFromDom(container) {
  const host = resolveHost(container);
  const existing = findExistingOverlay(host);
  if (!existing) return;

  overlayEl = existing;
  fillEl = existing.querySelector('.preview-loading-fill');
  labelEl = existing.querySelector('.preview-loading-label');
  hostEl = host;
  pendingHost = host;
  refCount = 1;
  currentProgress = 5;
  targetProgress = PHASE_TARGETS.render;
  overlayVisible = false;
  existing.classList.remove('preview-loading--visible', 'preview-loading--hiding');
  setFillWidth(currentProgress);
  scheduleReveal();
}
