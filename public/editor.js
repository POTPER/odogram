import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const KEYWORDS = new Set([
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirementDiagram',
  'C4Context',
  'subgraph',
  'end',
  'classDef',
  'class',
  'style',
  'linkStyle',
  'click',
  'config',
  'layout',
  'direction',
  'LR',
  'RL',
  'TB',
  'BT',
  'TD',
  'participant',
  'actor',
  'loop',
  'alt',
  'else',
  'opt',
  'par',
  'and',
  'note',
  'title',
  'section',
  'activate',
  'deactivate',
  'autonumber',
]);

const mermaidLanguage = StreamLanguage.define({
  name: 'mermaid',
  tokenTable: {
    mmComment: tags.lineComment,
    mmKeyword: tags.keyword,
    mmString: tags.string,
    mmOperator: tags.operator,
    mmVariable: tags.variableName,
    mmMeta: tags.meta,
  },
  startState() {
    return {};
  },
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match('%%')) {
      stream.skipToEnd();
      return 'mmComment';
    }

    if (stream.match(/"(?:[^"\\]|\\.)*"/) || stream.match(/'(?:[^'\\]|\\.)*'/)) {
      return 'mmString';
    }

    if (stream.match(/(?:<-->|--o|--x|==+>|-.->|-->|===|---)/)) {
      return 'mmOperator';
    }

    if (stream.match(/[{}[\]|;:]/)) {
      return 'mmMeta';
    }

    if (stream.match(/[a-zA-Z][\w-]*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return 'mmKeyword';
      return 'mmVariable';
    }

    stream.next();
    return null;
  },
});

const mermaidHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#569cd6' },
  { tag: tags.lineComment, color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.operator, color: '#d4d4d4' },
  { tag: tags.variableName, color: '#cccccc' },
  { tag: tags.meta, color: '#858585' },
]);

const cursorDarkTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#1e1e1e',
      color: '#cccccc',
      fontSize: '13px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      lineHeight: '1.5',
    },
    '.cm-content': {
      padding: '12px 0',
      caretColor: '#cccccc',
    },
    '.cm-gutters': {
      backgroundColor: '#252526',
      color: '#858585',
      border: 'none',
      borderRight: '1px solid #3c3c3c',
    },
    '.cm-gutter.cm-lineNumbers': {
      minWidth: '3ch',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2a2d2e',
      color: '#cccccc',
    },
    '.cm-activeLine': {
      backgroundColor: '#2a2d2e',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#cccccc',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#264f78 !important',
    },
  },
  { dark: true },
);

export function createMermaidEditor(parent, { initialDoc = '', onChange } = {}) {
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      EditorView.lineWrapping,
      mermaidLanguage,
      syntaxHighlighting(mermaidHighlightStyle, { fallback: true }),
      cursorDarkTheme,
      keymap.of([indentWithTab, ...defaultKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChange) onChange();
      }),
      EditorView.contentAttributes.of({ spellcheck: 'false' }),
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
