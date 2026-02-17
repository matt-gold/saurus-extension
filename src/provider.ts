import * as vscode from "vscode";
import { SaurusController } from "./commands";
import { buildProviderItems } from "./providerModel";
import { ThesaurusLookupInfo } from "./types";

function buildThesaurusDocumentation(info?: ThesaurusLookupInfo): vscode.MarkdownString {
  const doc = new vscode.MarkdownString();
  doc.isTrusted = false;
  doc.supportHtml = false;

  doc.appendMarkdown("**Merriam-Webster Thesaurus Response**\n\n");

  if (!info) {
    doc.appendMarkdown("_No thesaurus API response available yet._\n");
    return doc;
  }

  doc.appendMarkdown(`- Provider: ${info.provider}\n`);
  doc.appendMarkdown(`- Query: \`${info.query}\`\n`);
  doc.appendMarkdown(`- Entries returned: ${info.entryCount}\n`);
  doc.appendMarkdown(`- Suggestions extracted: ${info.suggestionCount}\n`);
  if (info.partOfSpeech) {
    doc.appendMarkdown(`- Part of speech: ${info.partOfSpeech}\n`);
  }

  if (info.definitions.length > 0) {
    doc.appendMarkdown("\n**Definitions**\n");
    for (const definition of info.definitions) {
      doc.appendMarkdown(`- ${definition}\n`);
    }
  }

  if (info.stems.length > 0) {
    doc.appendMarkdown("\n**Stems**\n");
    for (const stem of info.stems) {
      doc.appendMarkdown(`- \`${stem}\`\n`);
    }
  }

  if (info.didYouMean.length > 0) {
    doc.appendMarkdown("\n**Did You Mean**\n");
    for (const candidate of info.didYouMean) {
      doc.appendMarkdown(`- ${candidate}\n`);
    }
  }

  return doc;
}

export class SaurusCompletionProvider implements vscode.CompletionItemProvider {
  public readonly onDidChangeCompletionItems: vscode.Event<void>;

  public constructor(private readonly controller: SaurusController) {
    this.onDidChangeCompletionItems = controller.onDidChangeCompletionItems;
  }

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const lookup = this.controller.getCompletionLookup(document, position);
    if (!lookup) {
      return undefined;
    }

    const menuItems = buildProviderItems({
      sourceStates: lookup.sourceStates,
      hasEntry: Boolean(lookup.entry),
      thesaurusOptions: lookup.entry?.thesaurusOptions ?? [],
      aiOptions: lookup.entry?.aiOptions ?? [],
      thesaurusCached: (lookup.entry?.thesaurusOptions.length ?? 0) > 0,
      aiCached: (lookup.entry?.aiOptions.length ?? 0) > 0,
      thesaurusProvider: lookup.thesaurusProvider,
      placeholderRawText: lookup.match.rawFullText,
      aiAutoRun: lookup.aiAutoRun
    });

    if (menuItems.length === 0) {
      return undefined;
    }

    const completionItems: vscode.CompletionItem[] = [];
    const preferRefreshSelection = lookup.preferRefreshSelection;
    let didPreselectAny = false;

    for (const menuItem of menuItems) {
      const item = new vscode.CompletionItem(menuItem.label, vscode.CompletionItemKind.Text);
      item.filterText = lookup.match.rawFullText;
      item.sortText = `${String(completionItems.length).padStart(4, "0")}-${menuItem.sortText}`;
      item.detail = menuItem.detail;
      if (menuItem.source === "thesaurus") {
        item.documentation = buildThesaurusDocumentation(lookup.entry?.thesaurusInfo);
      }

      if (menuItem.kind === "refresh") {
        // Keep this row command-only; do not edit document text.
        item.insertText = "";
        item.range = new vscode.Range(position, position);
        if (preferRefreshSelection) {
          item.preselect = true;
          didPreselectAny = true;
        }
        item.command = {
          command: "saurus.refreshSuggestions",
          title: "Get more AI options",
          arguments: [
            document.uri.toString(),
            lookup.match.innerRange.start.line,
            lookup.match.innerRange.start.character
          ]
        };
        completionItems.push(item);
        continue;
      }

      if (
        menuItem.kind === "section" ||
        menuItem.kind === "loading" ||
        menuItem.kind === "empty"
      ) {
        // Simulate non-actionable separator/status rows inside the suggest list.
        // Keep these rows command-only; do not edit document text.
        item.insertText = "";
        item.range = new vscode.Range(position, position);
        item.command = {
          command: "saurus.reopenSuggestions",
          title: "Continue suggestions",
          arguments: [
            document.uri.toString(),
            lookup.match.innerRange.start.line,
            lookup.match.innerRange.start.character
          ]
        };
        completionItems.push(item);
        continue;
      }

      // Keep suggestion rows command-driven so all rows share a single
      // completion range and VS Code ordering remains deterministic.
      item.insertText = "";
      item.range = new vscode.Range(position, position);
      item.command = {
        command: "saurus.applySuggestion",
        title: "Apply suggestion",
        arguments: [
          document.uri.toString(),
          lookup.match.innerRange.start.line,
          lookup.match.innerRange.start.character,
          menuItem.insertText
        ]
      };
      if (!didPreselectAny && !preferRefreshSelection) {
        item.preselect = true;
        didPreselectAny = true;
      }
      completionItems.push(item);
    }

    return new vscode.CompletionList(completionItems, false);
  }
}
