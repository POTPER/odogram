export function statusLabel(status) {
  if (status === 'done') return 'Done';
  if (status === 'progress') return 'In Progress';
  if (status === 'deprecated') return 'Deprecated';
  return 'Plan';
}
