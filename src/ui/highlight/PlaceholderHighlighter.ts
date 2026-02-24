import * as vscode from "vscode";
import { SaurusController } from "../../app";
import { findAllPlaceholdersInLine } from "../../core/placeholder";

type HighlightSettings = {
  enabled: boolean;
  backgroundColor: string;
  borderColor: string;
  delimiterColor: string;
  textColor: string;};

function getHighlightSettings(document?: vscode.TextDocument): HighlightSettings {
  const cfg = vscode.workspace.getConfiguration("saurus", document);
  return {
    enabled: cfg.get<boolean>("placeholderHighlight.enabled", true),
    backgroundColor: cfg.get<string>("placeholderHighlight.backgroundColor", "rgba(34, 197, 94, 0.16)"),
    borderColor: cfg.get<string>("placeholderHighlight.borderColor", "rgba(74, 222, 128, 0.55)"),
    delimiterColor: cfg.get<string>("placeholderHighlight.delimiterColor", "#86efac"),
    textColor: cfg.get<string>("placeholderHighlight.textColor", "#dcfce7")
  };
}

/** Manages placeholder highlight decorations in open editors. */
export class PlaceholderHighlighter implements vscode.Disposable {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private styleKey = "";
  private fullDecoration: vscode.TextEditorDecorationType;
  private delimiterDecoration: vscode.TextEditorDecorationType;
  private innerDecoration: vscode.TextEditorDecorationType;

  public constructor(private readonly controller: SaurusController) {
    const defaults = getHighlightSettings();
    this.fullDecoration = vscode.window.createTextEditorDecorationType({});
    this.delimiterDecoration = vscode.window.createTextEditorDecorationType({});
    this.innerDecoration = vscode.window.createTextEditorDecorationType({});
    this.ensureDecorationStyles(defaults);
  }

  public dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    this.fullDecoration.dispose();
    this.delimiterDecoration.dispose();
    this.innerDecoration.dispose();
  }

  public refreshVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.schedule(editor);
    }
  }

  public scheduleForDocument(document: vscode.TextDocument, delayMs = 0): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() !== document.uri.toString()) {
        continue;
      }

      this.schedule(editor, delayMs);
    }
  }

  public clearForDocument(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    const timer = this.timers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(uri);
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() !== uri) {
        continue;
      }

      this.clearEditorDecorations(editor);
    }
  }

  public schedule(editor: vscode.TextEditor, delayMs = 0): void {
    const uri = editor.document.uri.toString();
    const previous = this.timers.get(uri);
    if (previous) {
      clearTimeout(previous);
      this.timers.delete(uri);
    }

    const run = () => {
      this.timers.delete(uri);
      this.renderEditor(editor);
    };

    if (delayMs <= 0) {
      run();
      return;
    }

    const timer = setTimeout(run, delayMs);
    this.timers.set(uri, timer);
  }

  private renderEditor(editor: vscode.TextEditor): void {
    const document = editor.document;
    if (!this.controller.isEnabledForDocument(document)) {
      this.clearEditorDecorations(editor);
      return;
    }

    const highlightSettings = getHighlightSettings(document);
    if (!highlightSettings.enabled) {
      this.clearEditorDecorations(editor);
      return;
    }

    this.ensureDecorationStyles(highlightSettings);

    const settings = this.controller.getSettings(document);
    const open = settings.delimiters.open;
    const close = settings.delimiters.close;

    const fullRanges: vscode.Range[] = [];
    const delimiterRanges: vscode.Range[] = [];
    const innerRanges: vscode.Range[] = [];

    for (let line = 0; line < document.lineCount; line += 1) {
      const text = document.lineAt(line).text;
      const matches = findAllPlaceholdersInLine(text, open, close);
      for (const match of matches) {
        fullRanges.push(new vscode.Range(line, match.start, line, match.end));
        delimiterRanges.push(new vscode.Range(line, match.start, line, match.innerStart));
        delimiterRanges.push(new vscode.Range(line, match.innerEnd, line, match.end));

        if (match.innerEnd > match.innerStart) {
          innerRanges.push(new vscode.Range(line, match.innerStart, line, match.innerEnd));
        }
      }
    }

    editor.setDecorations(this.fullDecoration, fullRanges);
    editor.setDecorations(this.delimiterDecoration, delimiterRanges);
    editor.setDecorations(this.innerDecoration, innerRanges);
  }

  private clearEditorDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.fullDecoration, []);
    editor.setDecorations(this.delimiterDecoration, []);
    editor.setDecorations(this.innerDecoration, []);
  }

  private ensureDecorationStyles(style: HighlightSettings): void {
    const nextStyleKey = JSON.stringify(style);
    if (nextStyleKey === this.styleKey) {
      return;
    }

    this.fullDecoration.dispose();
    this.delimiterDecoration.dispose();
    this.innerDecoration.dispose();

    this.fullDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: style.backgroundColor,
      border: `1px solid ${style.borderColor}`,
      borderRadius: "3px"
    });

    this.delimiterDecoration = vscode.window.createTextEditorDecorationType({
      color: style.delimiterColor,
      fontWeight: "700"
    });

    this.innerDecoration = vscode.window.createTextEditorDecorationType({
      color: style.textColor
    });

    this.styleKey = nextStyleKey;
  }
}
