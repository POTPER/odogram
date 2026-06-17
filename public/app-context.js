export const ctx = {
  editor: null,
  user: null,
  currentId: null,
  lastShareUrl: '',
  lastGithubUrl: '',
  lastSvg: '',
  layoutUI: null,
  diagramIds: new Set(),
};

export const NEW_DIAGRAM_TEMPLATE = 'flowchart LR\n  A[New diagram] --> B[Edit me]';
export const ID_FORMAT_HINT = 'Use 3–64 characters: letters, numbers, underscore, hyphen';
export const ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
