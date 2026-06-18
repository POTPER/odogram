import { patchRoadmapSection } from './serialize-roadmap.js';

const MIME = 'application/x-odogram-roadmap';

function cloneMilestones(milestones) {
  return milestones.map((milestone) => ({
    id: milestone.id,
    delivers: milestone.delivers.map((deliver) => ({
      text: deliver.text,
      status: deliver.status || 'plan',
      ...(deliver.url ? { url: deliver.url } : {}),
    })),
  }));
}

function moveMilestone(milestones, fromIndex, toIndex) {
  if (fromIndex === toIndex) return milestones;
  const next = cloneMilestones(milestones);
  const [item] = next.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(insertAt, 0, item);
  return next;
}

function moveDeliver(milestones, fromMi, fromDi, toMi, toDi) {
  const next = cloneMilestones(milestones);
  const [deliver] = next[fromMi].delivers.splice(fromDi, 1);

  let insertAt = toDi;
  if (fromMi === toMi && fromDi < toDi) {
    insertAt -= 1;
  }

  next[toMi].delivers.splice(insertAt, 0, deliver);
  return next;
}

function parseDragPayload(event) {
  const raw = event.dataTransfer?.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setDragPayload(event, payload) {
  event.dataTransfer.setData(MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'move';
}

function clearDragState(container) {
  container.querySelectorAll('.oproduct-deliver-dragging').forEach((el) => {
    el.classList.remove('oproduct-deliver-dragging');
  });
  container.querySelectorAll('.oproduct-milestone-drag-over').forEach((el) => {
    el.classList.remove('oproduct-milestone-drag-over');
  });
  container.querySelectorAll('.oproduct-deliver-drag-over').forEach((el) => {
    el.classList.remove('oproduct-deliver-drag-over');
  });
}

export function bindRoadmapDnD(container, options) {
  const { getSource, setSource, doc, editable, onSourcePatched } = options;

  if (!editable) {
    container.classList.add('oproduct-roadmap-readonly');
    return () => {};
  }

  container.classList.remove('oproduct-roadmap-readonly');

  function commit(newMilestones) {
    const patched = patchRoadmapSection(getSource(), newMilestones);
    setSource(patched);
    onSourcePatched?.();
  }

  function onMilestoneDragStart(event) {
    const block = event.currentTarget.closest('.oproduct-milestone');
    if (!block) return;
    const milestoneIndex = Number.parseInt(block.dataset.milestoneIndex, 10);
    setDragPayload(event, { kind: 'milestone', milestoneIndex });
    block.classList.add('oproduct-deliver-dragging');
  }

  function onDeliverDragStart(event) {
    const item = event.currentTarget.closest('.oproduct-deliver');
    if (!item) return;
    const milestoneIndex = Number.parseInt(item.dataset.milestoneIndex, 10);
    const deliverIndex = Number.parseInt(item.dataset.deliverIndex, 10);
    setDragPayload(event, { kind: 'deliver', milestoneIndex, deliverIndex });
    item.classList.add('oproduct-deliver-dragging');
  }

  function onDragOver(event) {
    const payload = parseDragPayload(event);
    if (!payload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onMilestoneDragEnter(event) {
    const payload = parseDragPayload(event);
    if (!payload) return;
    const block = event.currentTarget.closest('.oproduct-milestone');
    if (!block) return;
    block.classList.add('oproduct-milestone-drag-over');
  }

  function onMilestoneDragLeave(event) {
    const block = event.currentTarget.closest('.oproduct-milestone');
    if (!block) return;
    if (block.contains(event.relatedTarget)) return;
    block.classList.remove('oproduct-milestone-drag-over');
  }

  function onDeliverDragEnter(event) {
    const payload = parseDragPayload(event);
    if (payload?.kind !== 'deliver') return;
    const target = event.currentTarget;
    if (target.classList.contains('oproduct-deliver')) {
      target.classList.add('oproduct-deliver-drag-over');
    }
  }

  function onDeliverDragLeave(event) {
    const target = event.currentTarget;
    if (!target.classList.contains('oproduct-deliver')) return;
    if (target.contains(event.relatedTarget)) return;
    target.classList.remove('oproduct-deliver-drag-over');
  }

  function onMilestoneDrop(event) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;

    const block = event.currentTarget.closest('.oproduct-milestone');
    if (!block) return;
    const toIndex = Number.parseInt(block.dataset.milestoneIndex, 10);
    clearDragState(container);

    const milestones = doc.views.roadmap.milestones;

    if (payload.kind === 'milestone') {
      commit(moveMilestone(milestones, payload.milestoneIndex, toIndex));
      return;
    }

    if (payload.kind === 'deliver') {
      const toDeliverIndex = milestones[toIndex]?.delivers.length ?? 0;
      commit(moveDeliver(
        milestones,
        payload.milestoneIndex,
        payload.deliverIndex,
        toIndex,
        toDeliverIndex,
      ));
    }
  }

  function onDeliverDrop(event) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (payload?.kind !== 'deliver') return;

    const target = event.currentTarget;
    const toMi = Number.parseInt(target.dataset.milestoneIndex, 10);
    const toDi = Number.parseInt(target.dataset.deliverIndex, 10);
    clearDragState(container);

    commit(moveDeliver(
      doc.views.roadmap.milestones,
      payload.milestoneIndex,
      payload.deliverIndex,
      toMi,
      toDi,
    ));
  }

  function onAppendDrop(event) {
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (payload?.kind !== 'deliver') return;

    const toMi = Number.parseInt(event.currentTarget.dataset.milestoneIndex, 10);
    const toDi = doc.views.roadmap.milestones[toMi]?.delivers.length ?? 0;
    clearDragState(container);

    commit(moveDeliver(
      doc.views.roadmap.milestones,
      payload.milestoneIndex,
      payload.deliverIndex,
      toMi,
      toDi,
    ));
  }

  function onDragEnd() {
    clearDragState(container);
  }

  const cleanups = [];

  container.querySelectorAll('.oproduct-milestone-handle').forEach((handle) => {
    handle.addEventListener('dragstart', onMilestoneDragStart);
    handle.addEventListener('dragend', onDragEnd);
    cleanups.push(() => {
      handle.removeEventListener('dragstart', onMilestoneDragStart);
      handle.removeEventListener('dragend', onDragEnd);
    });
  });

  container.querySelectorAll('.oproduct-deliver').forEach((item) => {
    item.addEventListener('dragstart', onDeliverDragStart);
    item.addEventListener('dragend', onDragEnd);
    item.addEventListener('dragover', onDragOver);
    item.addEventListener('dragenter', onDeliverDragEnter);
    item.addEventListener('dragleave', onDeliverDragLeave);
    item.addEventListener('drop', onDeliverDrop);
    cleanups.push(() => {
      item.removeEventListener('dragstart', onDeliverDragStart);
      item.removeEventListener('dragend', onDragEnd);
      item.removeEventListener('dragover', onDragOver);
      item.removeEventListener('dragenter', onDeliverDragEnter);
      item.removeEventListener('dragleave', onDeliverDragLeave);
      item.removeEventListener('drop', onDeliverDrop);
    });
  });

  container.querySelectorAll('.oproduct-deliver-append').forEach((zone) => {
    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('drop', onAppendDrop);
    cleanups.push(() => {
      zone.removeEventListener('dragover', onDragOver);
      zone.removeEventListener('drop', onAppendDrop);
    });
  });

  container.querySelectorAll('.oproduct-milestone').forEach((block) => {
    block.addEventListener('dragover', onDragOver);
    block.addEventListener('dragenter', onMilestoneDragEnter);
    block.addEventListener('dragleave', onMilestoneDragLeave);
    block.addEventListener('drop', onMilestoneDrop);
    cleanups.push(() => {
      block.removeEventListener('dragover', onDragOver);
      block.removeEventListener('dragenter', onMilestoneDragEnter);
      block.removeEventListener('dragleave', onMilestoneDragLeave);
      block.removeEventListener('drop', onMilestoneDrop);
    });
  });

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
