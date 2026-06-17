export const ctx = {
  editor: null,
  user: null,
  currentId: null,
  currentFolder: '',
  lastShareUrl: '',
  lastGithubUrl: '',
  lastSvg: '',
  layoutUI: null,
  diagramIds: new Set(),
  diagramFolders: [],
};

export const EXAMPLE_FOLDER = '示例';
export const EXAMPLE_ID = '欢迎';
export const ROOT_FOLDER = '';

export const NEW_DIAGRAM_TEMPLATE = 'flowchart LR\n  A[New diagram] --> B[Edit me]';
export const ID_FORMAT_HINT = '3–64 个字符：中文、字母、数字、下划线、连字符';
export const ID_PATTERN = /^[\p{L}\p{N}_-]{3,64}$/u;

export function diagramKey(folder, id) {
  const f = folder || '';
  return f ? `${f}/${id}` : id;
}

export function folderLabel(folder) {
  return folder || '未分组';
}
