import * as vscode from "vscode";
import { SaurusController } from "../../app";
import { buildCodeActions } from "./internal/buildCodeActions";

/** Exposes Saurus placeholder suggestions as native Quick Fix code actions. */
export class SaurusCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  public constructor(private readonly controller: SaurusController) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] {
    const position = range.start;
    let lookup = this.controller.getSuggestionActionLookup(document, position);
    if (!lookup) {
      return [];
    }

    if (!lookup.hasSuggestions && !lookup.isGenerating) {
      this.controller.maybeAutoGenerateSuggestions(document, position);
      lookup = this.controller.getSuggestionActionLookup(document, position) ?? lookup;
    }

    const codeActions = buildCodeActions(lookup);
    return codeActions.map((item) => {
      if (item.kind === "suggestion") {
        const action = new vscode.CodeAction(item.title, vscode.CodeActionKind.QuickFix);
        action.isPreferred = item.preferred;
        action.command = {
          command: "saurus.applySuggestion",
          title: item.title,
          arguments: [
            document.uri.toString(),
            lookup.match.innerRange.start.line,
            lookup.match.innerRange.start.character,
            item.suggestion
          ]
        };
        return action;
      }

      if (item.kind === "generate") {
        const action = new vscode.CodeAction(item.title, vscode.CodeActionKind.QuickFix);
        action.command = {
          command: lookup.hasSuggestions ? "saurus.refreshSuggestions" : "saurus.generateSuggestions",
          title: item.title,
          arguments: [
            document.uri.toString(),
            lookup.match.innerRange.start.line,
            lookup.match.innerRange.start.character
          ]
        };
        return action;
      }

      if (item.kind === "generateWithPrompt") {
        const action = new vscode.CodeAction(item.title, vscode.CodeActionKind.QuickFix);
        action.command = {
          command: "saurus.refreshSuggestionsWithPrompt",
          title: item.title,
          arguments: [
            document.uri.toString(),
            lookup.match.innerRange.start.line,
            lookup.match.innerRange.start.character
          ]
        };
        return action;
      }

      const action = new vscode.CodeAction(item.title, vscode.CodeActionKind.QuickFix);
      action.command = {
        command: "saurus.reopenQuickFix",
        title: item.title
      };
      return action;
    });
  }
}
