import * as vscode from "vscode";
import { SaurusController } from "./commands";
import { buildProviderItems } from "./providerModel";

export class SaurusCompletionProvider implements vscode.CompletionItemProvider {
  public constructor(private readonly controller: SaurusController) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const lookup = this.controller.getCompletionLookup(document, position);
    if (!lookup) {
      return undefined;
    }

    const menuItems = buildProviderItems({
      state: lookup.state,
      hasEntry: Boolean(lookup.entry),
      options: lookup.entry?.options ?? [],
      placeholderRawText: lookup.match.rawFullText
    });

    if (menuItems.length === 0) {
      return undefined;
    }

    const completionItems = menuItems.map((menuItem) => {
      const item = new vscode.CompletionItem(menuItem.label, vscode.CompletionItemKind.Text);
      item.filterText = lookup.match.rawFullText;
      item.sortText = menuItem.sortText;
      item.detail = menuItem.detail;

      if (menuItem.kind === "refresh") {
        // Refresh row should not edit text; it only triggers a new fetch.
        item.insertText = "";
        item.range = new vscode.Range(position, position);
        item.command = {
          command: "saurus.refreshSuggestions",
          title: "Get different options",
          arguments: [
            document.uri.toString(),
            lookup.match.innerRange.start.line,
            lookup.match.innerRange.start.character
          ]
        };
        return item;
      }

      if (menuItem.kind === "generating" || menuItem.kind === "empty") {
        item.insertText = "";
        item.range = new vscode.Range(position, position);
        return item;
      }

      item.insertText = menuItem.insertText;
      item.range = lookup.match.fullRange;
      return item;
    });

    return new vscode.CompletionList(completionItems, true);
  }
}
