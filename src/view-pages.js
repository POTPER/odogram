import {
  ELK_LAYOUT_INTEGRITY,
  ELK_LAYOUT_URL,
  MERMAID_CDN_INTEGRITY,
  MERMAID_CDN_URL,
} from './cdn-integrity.js';
import { getShareUrl } from './github.js';

export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toBase64Url(bytes) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildViewCsp(nonce, format) {
  const isOproduct = format === 'oproduct';
  const styleDirectives = isOproduct
    ? [`style-src 'self' 'nonce-${nonce}'`]
    : [
        `style-src-elem 'self' 'nonce-${nonce}'`,
        `style-src-attr 'unsafe-inline'`,
      ];

  return [
    "default-src 'self'",
    isOproduct
      ? `script-src 'self' 'nonce-${nonce}'`
      : `script-src 'self' https://cdn.jsdelivr.net 'nonce-${nonce}'`,
    ...styleDirectives,
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const VIEW_LOADING_HTML = `<div class="preview-loading" role="status" aria-live="polite">
  <div class="preview-loading-panel">
    <div class="preview-loading-bar"><div class="preview-loading-fill preview-loading-fill--initial"></div></div>
    <span class="preview-loading-label">Loading diagram…</span>
  </div>
</div>`;

const VIEW_LOADING_CSS = `
    .preview-loading {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: none;
      align-items: center;
      justify-content: center;
      background: #1e1e1e;
    }
    .preview-loading--visible { display: flex; }
    .preview-loading:not(.preview-loading--visible) { pointer-events: none; }
    .preview-loading--hiding { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
    .preview-loading-panel {
      width: min(280px, calc(100% - 48px));
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .preview-loading-bar {
      height: 4px;
      border-radius: 999px;
      background: #3c3c3c;
      overflow: hidden;
    }
    .preview-loading-fill {
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: #007acc;
    }
    .preview-loading-fill--initial {
      width: 15%;
    }
    .preview-loading-label {
      font-size: 12px;
      color: #858585;
      text-align: center;
    }`;

export function viewPageHtml({ username, id, folder, code, origin, nonce }) {
  const safeUser = escapeHtml(username);
  const safeId = escapeHtml(id);
  const safeFolder = folder ? escapeHtml(folder) : '';
  const displayPath = folder ? `${safeFolder} / ${safeId}` : safeId;
  const codeJson = JSON.stringify(code).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en" class="view-page">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeId} — odogram</title>
  <link rel="stylesheet" href="/styles/view-tokens.css">
  <link rel="stylesheet" href="/styles/view-preview.css">
  <link rel="stylesheet" href="/styles/mermaid-sequence.css">
  <script type="importmap" nonce="${nonce}">
  {
    "imports": {
      "mermaid": "${MERMAID_CDN_URL}",
      "elk-layouts": "${ELK_LAYOUT_URL}"
    },
    "integrity": {
      "${MERMAID_CDN_URL}": "${MERMAID_CDN_INTEGRITY}",
      "${ELK_LAYOUT_URL}": "${ELK_LAYOUT_INTEGRITY}"
    }
  }
  </script>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    html.view-page,
    body.view-page {
      margin: 0;
      height: 100%;
      overflow: hidden;
    }
    body.view-page {
      display: flex;
      flex-direction: column;
      background: #1e1e1e;
      color: #cccccc;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    #preview.preview-viewport {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
      touch-action: none;
      background: #1e1e1e;
    }
    #preview-canvas {
      position: absolute;
      inset: 0;
    }
    #preview-canvas svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      flex-shrink: 0;
    }
    header a {
      color: #007acc;
      text-decoration: none;
    }
    header a:hover { text-decoration: underline; }
    .meta { color: #858585; font-size: 13px; }
    ${VIEW_LOADING_CSS}
  </style>
</head>
<body class="view-page">
  <header>
    <a href="/">odogram</a>
    <span class="meta">${safeUser} / ${displayPath}</span>
    <a href="${escapeHtml(getShareUrl(origin, username, id, folder))}">Share</a>
  </header>
  <div class="view-preview-toolbar">
    <div class="preview-controls">
      <button type="button" id="btn-zoom-out" title="Zoom out" disabled>−</button>
      <span id="zoom-label" class="zoom-label">100%</span>
      <button type="button" id="btn-zoom-in" title="Zoom in" disabled>+</button>
      <button type="button" id="btn-zoom-fit" title="Fit to panel" disabled>Fit</button>
      <button type="button" id="btn-zoom-reset" title="100%" disabled>1:1</button>
    </div>
  </div>
  <div id="preview" class="preview-viewport">${VIEW_LOADING_HTML}<div id="preview-canvas"></div></div>
  <script id="diagram-data" type="application/json">${codeJson}</script>
  <script type="module" src="/view-mermaid.js" nonce="${nonce}" crossorigin="anonymous"></script>
</body>
</html>`;
}

export function viewOproductPageHtml({ username, id, folder, code, origin, nonce }) {
  const safeUser = escapeHtml(username);
  const safeId = escapeHtml(id);
  const safeFolder = folder ? escapeHtml(folder) : '';
  const displayPath = folder ? `${safeFolder} / ${safeId}` : safeId;
  const codeJson = JSON.stringify(code).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeId} — odogram</title>
  <link rel="stylesheet" href="/style.css">
  <style nonce="${nonce}">
    body { margin: 0; min-height: 100vh; background: #1e1e1e; color: #cccccc; font-family: 'Segoe UI', system-ui, sans-serif; }
    header {
      display: flex; align-items: center; gap: 12px; padding: 10px 16px;
      background: #252526; border-bottom: 1px solid #3c3c3c;
    }
    header a { color: #007acc; text-decoration: none; }
    header a:hover { text-decoration: underline; }
    .meta { color: #858585; font-size: 13px; }
    .oproduct-readonly-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; background: #252526; border-bottom: 1px solid #3c3c3c;
    }
    #preview { position: relative; flex: 1; overflow: auto; padding: 16px; min-height: 0; }
    #preview-canvas { position: relative; inset: auto; min-height: 100%; }
  </style>
</head>
<body>
  <header>
    <a href="/">odogram</a>
    <span class="meta">${safeUser} / ${displayPath}</span>
    <a href="${escapeHtml(getShareUrl(origin, username, id, folder))}">Share</a>
  </header>
  <div class="oproduct-readonly-bar">
    <span class="meta">Product view</span>
    <div id="oproduct-view-toolbar" class="oproduct-view-switch" role="group" aria-label="Product view">
      <button type="button" class="mode-btn active" data-oproduct-view="tree" aria-pressed="true">Tree</button>
      <button type="button" class="mode-btn" data-oproduct-view="roadmap" aria-pressed="false">Roadmap</button>
      <button type="button" class="mode-btn" data-oproduct-view="journey" aria-pressed="false">Journey</button>
    </div>
  </div>
  <div id="preview">${VIEW_LOADING_HTML}<div id="preview-canvas"></div></div>
  <script id="diagram-data" type="application/json">${codeJson}</script>
  <script type="module" src="/view-oproduct.js" nonce="${nonce}" crossorigin="anonymous"></script>
</body>
</html>`;
}

export function viewErrorPageHtml({ title, message, statusHint = '' }) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeHint = statusHint ? escapeHtml(statusHint) : '';

  return `<!DOCTYPE html>
<html lang="en" class="view-page">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} — odogram</title>
  <style>
    * { box-sizing: border-box; }
    html.view-page, body.view-page {
      margin: 0;
      height: 100%;
      overflow: hidden;
      background: #1e1e1e;
      color: #cccccc;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    body.view-page {
      display: flex;
      flex-direction: column;
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      flex-shrink: 0;
    }
    header a { color: #007acc; text-decoration: none; }
    header a:hover { text-decoration: underline; }
    .view-error {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 32px 24px;
      text-align: center;
    }
    .view-error h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    .view-error p {
      margin: 0;
      max-width: 420px;
      line-height: 1.5;
      color: #cccccc;
    }
    .view-error .meta {
      color: #858585;
      font-size: 13px;
    }
  </style>
</head>
<body class="view-page">
  <header>
    <a href="/">odogram</a>
  </header>
  <main class="view-error">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    ${safeHint ? `<p class="meta">${safeHint}</p>` : ''}
    <p><a href="/">返回 odogram</a></p>
  </main>
</body>
</html>`;
}
