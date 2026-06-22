import { initMermaid } from './mermaid-init.js';
import { initPreview } from './preview.js';
import { escapeHtml } from './escape-html.js';
import { disableContextMenu } from './view-shared.js';
import {
  endPreviewLoading,
  initPreviewLoadingFromDom,
  setPreviewLoadingPhase,
} from './preview-loading.js';

const previewHost = document.getElementById('preview');
const code = JSON.parse(document.getElementById('diagram-data').textContent);

initMermaid({ securityLevel: 'strict' });

initPreviewLoadingFromDom(previewHost);
setPreviewLoadingPhase('render');

const { renderPreviewNow } = initPreview({
  readOnly: true,
  getSource: () => code,
  escapeHtml,
  showStatus: () => {},
});

try {
  await renderPreviewNow();
} finally {
  previewHost.querySelector('.preview-loading')?.remove();
  endPreviewLoading();
}

disableContextMenu();
