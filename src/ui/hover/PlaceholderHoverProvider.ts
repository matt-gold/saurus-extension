import * as vscode from "vscode";
import { SaurusController } from "../../app";
import { findPlaceholderAtPosition } from "../../core/placeholder";

function createCommandUri(command: string, args: unknown[]): vscode.Uri {
  return vscode.Uri.parse(`command:${command}?${encodeURIComponent(JSON.stringify(args))}`);
}

/** Adds placeholder hover actions for reopening Saurus and running prompt-based generation. */
export class PlaceholderHoverProvider implements vscode.HoverProvider {
  public constructor(private readonly controller: SaurusController) {}

  public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!this.controller.isEnabledForDocument(document)) {
      return undefined;
    }

    const settings = this.controller.getSettings(document);
    const match = findPlaceholderAtPosition(document, position, settings.delimiters);
    if (!match) {
      return undefined;
    }

    const key = this.controller.getSuggestionKeyAtPosition(document, match.innerRange.start);
    const primaryTitle = key && this.controller.hasCachedEntry(key)
      ? "Open Saurus"
      : "Generate Suggestions";

    const primaryLink = createCommandUri("saurus.reopenQuickFix", [
      document.uri.toString(),
      match.innerRange.start.line,
      match.innerRange.start.character
    ]);
    const promptLink = createCommandUri("saurus.refreshSuggestionsWithPrompt", [
      document.uri.toString(),
      match.innerRange.start.line,
      match.innerRange.start.character
    ]);

    const markdown = new vscode.MarkdownString(
      `[${primaryTitle}](${primaryLink}) · [Generate With Prompt](${promptLink})`
    );
    markdown.isTrusted = true;
    markdown.supportHtml = false;

    return new vscode.Hover(markdown, match.fullRange);
  }
}
