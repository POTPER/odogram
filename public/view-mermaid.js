import mermaid from 'mermaid';
import elkLayouts from 'elk-layouts';
import { disableContextMenu } from './view-shared.js';
import {
  endPreviewLoading,
  initPreviewLoadingFromDom,
  setPreviewLoadingPhase,
} from './preview-loading.js';

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({
  securityLevel: 'strict',
  theme: 'base',
  startOnLoad: false,
  themeVariables: {
    darkMode: true,
    background: '#1e1e1e',
    primaryColor: '#2d2d2d',
    primaryTextColor: '#cccccc',
    primaryBorderColor: '#007acc',
    lineColor: '#cccccc',
    textColor: '#cccccc',
    mainBkg: '#2d2d2d',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    fontSize: '14px',
  },
});

const previewHost = document.getElementById('preview');
const previewCanvas = document.getElementById('preview-canvas');
const code = JSON.parse(document.getElementById('diagram-data').textContent);
const renderId = 'view-diagram-' + Date.now();

initPreviewLoadingFromDom(previewHost);
setPreviewLoadingPhase('render');

try {
  const { svg } = await mermaid.render(renderId, code);
  previewCanvas.innerHTML = svg;
} catch (err) {
  previewCanvas.innerHTML = '<div class="error">Failed to render diagram</div>';
} finally {
  endPreviewLoading();
}

disableContextMenu();
