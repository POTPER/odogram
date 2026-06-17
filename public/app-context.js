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
export const ID_FORMAT_HINT = '3–64 个字符：中文、字母、数字、下划线、连字符';
export const ID_PATTERN = /^[\p{L}\p{N}_-]{3,64}$/u;
