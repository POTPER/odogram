import {
  renderOproductPreview,
  initOproductViewSwitcher,
} from './oproduct-preview.js';
import { escapeHtml } from './escape-html.js';
import { disableContextMenu } from './view-shared.js';
import {
  endPreviewLoading,
  initPreviewLoadingFromDom,
  setPreviewLoadingPhase,
} from './preview-loading.js';

const previewHost = document.getElementById('preview');
const container = document.getElementById('preview-canvas');
const code = JSON.parse(document.getElementById('diagram-data').textContent);

initPreviewLoadingFromDom(previewHost);
setPreviewLoadingPhase('render');

initOproductViewSwitcher(container);
renderOproductPreview({ code, container, escapeHtml });

endPreviewLoading();
disableContextMenu();
