export const VIEWS = ['tree', 'roadmap', 'journey'];

export const STATUSES = ['done', 'plan', 'deprecated', 'progress'];

export function createEmptyDoc(title = '') {
  return {
    title,
    defaultView: 'tree',
    views: {
      tree: { modules: [] },
      roadmap: { milestones: [] },
      journey: { personas: [] },
    },
  };
}
