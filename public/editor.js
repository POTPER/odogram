import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from 'https://esm.sh/@codemirror/view@6.38.6?deps=@codemirror/state@6.5.2';
import { EditorState, Transaction } from 'https://esm.sh/@codemirror/state@6.5.2';
import { defaultKeymap, history, historyKeymap, indentWithTab } from 'https://esm.sh/@codemirror/commands@6.8.1?deps=@codemirror/state@6.5.2';
import { syntaxHighlighting, HighlightStyle, StreamLanguage, LanguageSupport } from 'https://esm.sh/@codemirror/language@6.11.3?deps=@codemirror/state@6.5.2,@codemirror/view@6.38.6';
import { Tag } from 'https://esm.sh/@lezer/highlight@1.2.3';

const mermaidTags = {
  comment: Tag.define(),
  keyword: Tag.define(),
  string: Tag.define(),
  operator: Tag.define(),
  variable: Tag.define(),
  meta: Tag.define(),
};

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
    mmComment: mermaidTags.comment,
    mmKeyword: mermaidTags.keyword,
    mmString: mermaidTags.string,
    mmOperator: mermaidTags.operator,
    mmVariable: mermaidTags.variable,
    mmMeta: mermaidTags.meta,
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
  { tag: mermaidTags.keyword, color: '#569cd6' },
  { tag: mermaidTags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: mermaidTags.string, color: '#ce9178' },
  { tag: mermaidTags.operator, color: '#d4d4d4' },
  { tag: mermaidTags.variable, color: '#cccccc' },
  { tag: mermaidTags.meta, color: '#858585' },
]);

const mermaidSupport = new LanguageSupport(mermaidLanguage, [
  syntaxHighlighting(mermaidHighlightStyle, { fallback: true }),
]);

const editorDarkTheme = EditorView.theme(
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
      mermaidSupport,
      editorDarkTheme,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
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
        annotations: Transaction.addToHistory.of(false),
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
