import mermaid from 'mermaid';
import elkLayouts from 'elk-layouts';
import { cursorDarkTheme } from './theme.js';

export function initMermaid(options = {}) {
  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.initialize({
    ...cursorDarkTheme,
    startOnLoad: false,
    ...options,
  });
}
