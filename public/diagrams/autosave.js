import { ctx } from '../app-context.js';
import { api, state } from './registry.js';

export function syncBaseline(code) {
  state.baselineCode = code;
}

export function hasUnsavedChanges(code) {
  return code !== state.baselineCode;
}

export function clearAutoSaveTimer() {
  if (state.autoSaveTimer !== null) {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }
}

export function markContentDirty() {
  if (state.suppressAutoSave) return;
  state.contentDirty = true;
}

export function clearContentDirty() {
  state.contentDirty = false;
}

export function setSuppressAutoSave(value) {
  state.suppressAutoSave = value;
}

export async function flushAutoSave() {
  clearAutoSaveTimer();
  if (state.contentDirty && ctx.user?.login && ctx.currentId && !state.suppressAutoSave) {
    await api.saveIfDirty({ quiet: true });
  }
}

export function scheduleAutoSave() {
  if (state.suppressAutoSave || !ctx.user?.login || !ctx.currentId) return;

  const code = ctx.editor.getValue();
  if (!hasUnsavedChanges(code)) {
    state.contentDirty = false;
    return;
  }

  state.contentDirty = true;
  clearAutoSaveTimer();
  state.autoSaveTimer = setTimeout(() => {
    state.autoSaveTimer = null;
    api.saveIfDirty({ quiet: true });
  }, 2000);
}

export function onPreviewRendered() {
  scheduleAutoSave();
}
