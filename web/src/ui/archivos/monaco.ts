// Monaco, el editor de VS Code (y de Cursor): mismas teclas para editar (⌘D, ⌥↑↓, ⌘/, ⌘F, ⌘⇧K, varios cursores…).
// Pesa: se carga la primera vez que se abre la ventana de Archivos (import dinámico desde Explorador.tsx).
import * as monaco from 'monaco-editor';
import TrabajadorEditor from 'monaco-editor/editor/editor.worker?worker';
import TrabajadorJson from 'monaco-editor/language/json/json.worker?worker';
import TrabajadorCss from 'monaco-editor/language/css/css.worker?worker';
import TrabajadorHtml from 'monaco-editor/language/html/html.worker?worker';
import TrabajadorTs from 'monaco-editor/language/typescript/ts.worker?worker';

(self as any).MonacoEnvironment = {
  getWorker(_: string, etiqueta: string) {
    if (etiqueta === 'json') return new TrabajadorJson();
    if (etiqueta === 'css' || etiqueta === 'scss' || etiqueta === 'less') return new TrabajadorCss();
    if (etiqueta === 'html' || etiqueta === 'handlebars' || etiqueta === 'razor') return new TrabajadorHtml();
    if (etiqueta === 'typescript' || etiqueta === 'javascript') return new TrabajadorTs();
    return new TrabajadorEditor();
  },
};

// cada archivo se abre suelto, sin el proyecto: sin errores de tipos ni de imports que no puede resolver (sí los de sintaxis)
for (const d of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
  d.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false, noSuggestionDiagnostics: true });
  d.setCompilerOptions({ ...d.getCompilerOptions(), jsx: monaco.typescript.JsxEmit.Preserve, allowJs: true, allowNonTsExtensions: true, target: monaco.typescript.ScriptTarget.ESNext });
}
monaco.json.jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: true, trailingCommas: 'ignore', schemaValidation: 'ignore', enableSchemaRequest: false });

// .env y compañía: CLAVE=valor, comentarios y comillas
monaco.languages.register({ id: 'dotenv', filenamePatterns: ['.env', '.env.*', '*.env'], aliases: ['Variables de entorno'] });
monaco.languages.setMonarchTokensProvider('dotenv', {
  tokenizer: {
    root: [
      [/^\s*#.*$/, 'comment'],
      [/^(\s*)(export)(\s+)/, ['', 'keyword', '']],
      [/^(\s*)([A-Za-z_][\w.-]*)(\s*)(=)/, ['', 'variable', '', 'delimiter']],
      [/"([^"\\]|\\.)*"/, 'string'], [/'[^']*'/, 'string'],
      [/\$\{?[A-Za-z_]\w*\}?/, 'variable.predefined'],
      [/\s#.*$/, 'comment'],
    ],
  },
});
monaco.languages.setLanguageConfiguration('dotenv', { comments: { lineComment: '#' }, autoClosingPairs: [{ open: '"', close: '"' }, { open: "'", close: "'" }] });

// los colores de GitHub del cliente de git
monaco.editor.defineTheme('refugio', {
  base: 'vs-dark', inherit: true, rules: [],
  colors: {
    'editor.background': '#0d1117', 'editorGutter.background': '#0d1117', 'minimap.background': '#0d1117', 'editor.lineHighlightBackground': '#161b22',
    'editorLineNumber.foreground': '#6e7681', 'editorLineNumber.activeForeground': '#e6edf3', 'editorWidget.background': '#161b22', 'editorWidget.border': '#30363d',
    'input.background': '#0d1117', 'input.border': '#30363d', 'focusBorder': '#1f6feb', 'editor.selectionBackground': '#264f78', 'scrollbarSlider.background': '#30363d88',
  },
});

export { monaco };
