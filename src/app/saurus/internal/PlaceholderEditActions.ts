import * as vscode from "vscode";
import {
  findAllPlaceholdersInLine,
  findPlaceholderAtPosition,
  parsePlaceholderContent
} from "../../../core/placeholder";
import { SaurusSettings } from "../../../types";

type PlaceholderEditActionsDeps = {
  getSettings: (document?: vscode.TextDocument) => SaurusSettings;
  getSuggestionKeyAtPosition: (document: vscode.TextDocument, position: vscode.Position) => string | undefined;
  clearAiActionForKey: (key: string) => void;
};

/** Applies placeholder edit actions in the active text editor. */
export class PlaceholderEditActions {
  public constructor(private readonly deps: PlaceholderEditActionsDeps) {}

  public async applySuggestion(
    uri?: string,
    line?: number,
    character?: number,
    suggestion?: string
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || typeof suggestion !== "string") {
      return;
    }

    if (
      typeof uri === "string" &&
      typeof line === "number" &&
      typeof character === "number" &&
      editor.document.uri.toString() === uri
    ) {
      const target = new vscode.Position(line, character);
      editor.selection = new vscode.Selection(target, target);
    }

    const document = editor.document;
    const settings = this.deps.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return;
    }

    const match = findPlaceholderAtPosition(document, editor.selection.active, settings.delimiters);
    if (!match) {
      return;
    }

    const previousKey = this.deps.getSuggestionKeyAtPosition(document, editor.selection.active);
    const didEdit = await editor.edit((editBuilder) => {
      editBuilder.replace(match.fullRange, suggestion);
    });
    if (!didEdit) {
      return;
    }

    const caret = new vscode.Position(
      match.fullRange.start.line,
      match.fullRange.start.character + suggestion.length
    );
    editor.selection = new vscode.Selection(caret, caret);
    if (previousKey) {
      this.deps.clearAiActionForKey(previousKey);
    }
  }

  public async wrapSelectionInPlaceholder(editor: vscode.TextEditor, settings: SaurusSettings): Promise<boolean> {
    return this.wrapSelectionInPlaceholderWithPrompt(editor, settings);
  }

  public async wrapSelectionInPlaceholderWithPrompt(
    editor: vscode.TextEditor,
    settings: SaurusSettings,
    direction?: string
  ): Promise<boolean> {
    const selection = editor.selection;
    if (selection.isEmpty) {
      return false;
    }

    if (selection.start.line !== selection.end.line) {
      void vscode.window.showInformationMessage(
        "Saurus: selection suggestions currently support single-line selections. Select a shorter span."
      );
      return false;
    }

    const selectedText = editor.document.getText(selection);
    if (selectedText.trim().length === 0) {
      void vscode.window.showInformationMessage("Saurus: selected text is empty.");
      return false;
    }

    const normalizedDirection = direction?.trim() ?? "";
    const innerText = normalizedDirection.length > 0
      ? `${selectedText} :: ${normalizedDirection}`
      : selectedText;
    const placeholderText = `${settings.delimiters.open}${innerText}${settings.delimiters.close}`;
    const replacementRange = new vscode.Range(selection.start, selection.end);
    const didEdit = await editor.edit((editBuilder) => {
      editBuilder.replace(replacementRange, placeholderText);
    });

    if (!didEdit) {
      return false;
    }

    const cursor = new vscode.Position(
      replacementRange.start.line,
      replacementRange.start.character + settings.delimiters.open.length
    );
    editor.selection = new vscode.Selection(cursor, cursor);
    return true;
  }

  public async setPlaceholderPrompt(
    editor: vscode.TextEditor,
    settings: SaurusSettings,
    direction: string
  ): Promise<boolean> {
    const normalizedDirection = direction.trim();
    if (normalizedDirection.length === 0) {
      return false;
    }

    const match = findPlaceholderAtPosition(editor.document, editor.selection.active, settings.delimiters);
    if (!match) {
      return false;
    }

    const parsed = parsePlaceholderContent(match.rawInnerText);
    if (parsed.targetText.length === 0) {
      void vscode.window.showInformationMessage("Saurus: placeholder text cannot be empty before `::`.");
      return false;
    }

    const nextInnerText = `${parsed.targetText} :: ${normalizedDirection}`;
    const didEdit = await editor.edit((editBuilder) => {
      editBuilder.replace(match.innerRange, nextInnerText);
    });
    if (!didEdit) {
      return false;
    }

    const cursor = new vscode.Position(
      match.innerRange.start.line,
      match.innerRange.start.character + nextInnerText.length
    );
    editor.selection = new vscode.Selection(cursor, cursor);
    return true;
  }

  /** Removes all placeholder delimiters in the active document while preserving inner text. */
  public async removeAllPlaceholderDelimiters(editor: vscode.TextEditor, settings: SaurusSettings): Promise<number> {
    const document = editor.document;
    const replacements: Array<{ range: vscode.Range; text: string }> = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
      const line = document.lineAt(lineNumber);
      const matches = findAllPlaceholdersInLine(line.text, settings.delimiters.open, settings.delimiters.close);
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index];
        replacements.push({
          range: new vscode.Range(
            new vscode.Position(lineNumber, match.start),
            new vscode.Position(lineNumber, match.end)
          ),
          text: match.rawInnerText
        });
      }
    }

    if (replacements.length === 0) {
      return 0;
    }

    const didEdit = await editor.edit((editBuilder) => {
      for (const replacement of replacements) {
        editBuilder.replace(replacement.range, replacement.text);
      }
    });

    if (!didEdit) {
      return 0;
    }

    return replacements.length;
  }
}
