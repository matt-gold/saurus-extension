import * as vscode from "vscode";
import { SaurusController } from "../../app";
import { findAllPlaceholdersInLine } from "../../core/placeholder";

/** Adds clickable CodeLens actions above placeholders for reliably reopening Saurus. */
export class PlaceholderCodeLensProvider implements vscode.CodeLensProvider {
  public constructor(private readonly controller: SaurusController) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.controller.isEnabledForDocument(document)) {
      return [];
    }

    const settings = this.controller.getSettings(document);
    const lenses: vscode.CodeLens[] = [];

    for (let line = 0; line < document.lineCount; line += 1) {
      const text = document.lineAt(line).text;
      const matches = findAllPlaceholdersInLine(text, settings.delimiters.open, settings.delimiters.close);
      for (const match of matches) {
        const position = new vscode.Position(line, match.innerStart);
        const key = this.controller.getSuggestionKeyAtPosition(document, position);
        const range = new vscode.Range(line, match.start, line, match.end);
        const title = key && this.controller.hasCachedEntry(key)
          ? "Open Saurus"
          : "Generate Suggestions";
        lenses.push(
          new vscode.CodeLens(range, {
            command: "saurus.reopenQuickFix",
            title,
            arguments: [document.uri.toString(), line, match.innerStart]
          })
        );
      }
    }

    return lenses;
  }
}
