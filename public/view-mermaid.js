import mermaid from 'mermaid';
import elkLayouts from 'elk-layouts';
import { disableContextMenu } from './view-shared.js';
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

const preview = document.getElementById('preview');
const code = JSON.parse(document.getElementById('diagram-data').textContent);
const renderId = 'view-diagram-' + Date.now();

try {
  const { svg } = await mermaid.render(renderId, code);
  preview.innerHTML = svg;
} catch (err) {
  preview.innerHTML = '<div class="error">Failed to render diagram</div>';
}

disableContextMenu();