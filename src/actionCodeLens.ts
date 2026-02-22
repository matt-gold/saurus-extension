import * as vscode from "vscode";
import { SaurusController } from "./commands";

export class SaurusActionCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;
  private readonly stateChangeSubscription: vscode.Disposable;

  public constructor(private readonly controller: SaurusController) {
    this.stateChangeSubscription = controller.onDidChangeSuggestionState(() => {
      this.refresh();
    });
  }

  public dispose(): void {
    this.stateChangeSubscription.dispose();
    this.onDidChangeCodeLensesEmitter.dispose();
  }

  public refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.uri.toString() !== document.uri.toString()) {
      return [];
    }

    const lookup = this.controller.getSuggestionMenuLookup(document, activeEditor.selection.active);
    if (!lookup) {
      return [];
    }

    const range = new vscode.Range(lookup.match.fullRange.start, lookup.match.fullRange.start);
    const args = [
      document.uri.toString(),
      lookup.match.innerRange.start.line,
      lookup.match.innerRange.start.character
    ];

    const isGenerating = lookup.sourceStates.ai === "generating" || lookup.sourceStates.thesaurus === "generating";
    const hasEntry = Boolean(lookup.entry);
    const primaryTitle = isGenerating
      ? "Saurus: Generating..."
      : (hasEntry ? "Saurus: Refresh" : "Saurus: Generate");
    const primaryCommand = hasEntry ? "saurus.refreshSuggestions" : "saurus.generateSuggestions";

    const generateMoreTitle = lookup.sourceStates.ai === "generating" && lookup.aiActiveAction === "refresh"
      ? "Saurus: Generating more..."
      : "Saurus: Generate more";
    const generateWithPromptTitle = lookup.sourceStates.ai === "generating" && lookup.aiActiveAction === "refreshWithPrompt"
      ? "Saurus: Generating w/ prompt..."
      : "Saurus: Generate w/ prompt";

    return [
      new vscode.CodeLens(range, { title: primaryTitle, command: primaryCommand, arguments: args }),
      new vscode.CodeLens(range, { title: generateMoreTitle, command: "saurus.refreshSuggestions", arguments: args }),
      new vscode.CodeLens(range, { title: generateWithPromptTitle, command: "saurus.refreshSuggestionsWithPrompt", arguments: args }),
      new vscode.CodeLens(range, { title: "Saurus: AI only", command: "saurus.showAiOnlySuggestions", arguments: args }),
      new vscode.CodeLens(range, { title: "Saurus: Thesaurus only", command: "saurus.showThesaurusOnlySuggestions", arguments: args })
    ];
  }
}
