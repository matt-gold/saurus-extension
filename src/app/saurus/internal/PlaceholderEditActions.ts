import * as vscode from "vscode";
import { findPlaceholderAtPosition } from "../../../core/placeholder";
import { SaurusSettings } from "../../../types";
import { hideSuggestWidget } from "../../../ui/suggest";

type PlaceholderEditActionsDeps = {
  getSettings: (document?: vscode.TextDocument) => SaurusSettings;
  getSuggestionKeyAtPosition: (document: vscode.TextDocument, position: vscode.Position) => string | undefined;
  clearPreferRefreshSelectionForKey: (key: string) => void;
  clearSourceFilterForKey: (key: string) => void;
  clearAiActionForKey: (key: string) => void;};

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
      this.deps.clearPreferRefreshSelectionForKey(previousKey);
    }
  }

  public async exitPlaceholderSuggestions(uri?: string, line?: number, character?: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
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
      await hideSuggestWidget();
      return;
    }

    const match = findPlaceholderAtPosition(document, editor.selection.active, settings.delimiters);
    if (!match) {
      await hideSuggestWidget();
      return;
    }

    const previousKey = this.deps.getSuggestionKeyAtPosition(document, editor.selection.active);
    const didEdit = await editor.edit((editBuilder) => {
      editBuilder.replace(match.fullRange, match.rawInnerText);
    });
    if (didEdit) {
      const caret = new vscode.Position(
        match.fullRange.start.line,
        match.fullRange.start.character + match.rawInnerText.length
      );
      editor.selection = new vscode.Selection(caret, caret);
      if (previousKey) {
        this.deps.clearPreferRefreshSelectionForKey(previousKey);
        this.deps.clearSourceFilterForKey(previousKey);
        this.deps.clearAiActionForKey(previousKey);
      }
    }

    await hideSuggestWidget();
  }

  public async wrapSelectionInPlaceholder(editor: vscode.TextEditor, settings: SaurusSettings): Promise<boolean> {
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

    const placeholderText = `${settings.delimiters.open}${selectedText}${settings.delimiters.close}`;
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
}
