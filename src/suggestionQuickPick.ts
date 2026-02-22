import * as vscode from "vscode";
import { SaurusController, SuggestionMenuLookup, SuggestionStateChangeEvent } from "./commands";
import { buildCompletionSuggestions } from "./completionModel";

interface SuggestionQuickPickItem extends vscode.QuickPickItem {
  rowKind: "suggestion" | "action" | "status";
  rowId: string;
  suggestionText?: string;
  commandName?: string;
}

interface ActiveSession {
  documentUri: string;
  key: string;
}

export class SaurusSuggestionQuickPick implements vscode.Disposable {
  private quickPick: vscode.QuickPick<SuggestionQuickPickItem> | undefined;
  private activeSession: ActiveSession | undefined;
  private quickPickVisible = false;
  private readonly stateChangeSubscription: vscode.Disposable;

  public constructor(private readonly controller: SaurusController) {
    this.stateChangeSubscription = this.controller.onDidChangeSuggestionState((event) => {
      void this.handleSuggestionStateChange(event);
    });
  }

  public dispose(): void {
    this.stateChangeSubscription.dispose();
    this.disposeQuickPick();
  }

  public async openForEditor(editor: vscode.TextEditor): Promise<void> {
    const lookup = this.controller.getSuggestionMenuLookup(editor.document, editor.selection.active);
    if (!lookup) {
      this.syncWithActiveEditor();
      return;
    }

    const nextSession: ActiveSession = {
      documentUri: editor.document.uri.toString(),
      key: lookup.key
    };

    this.activeSession = nextSession;
    this.ensureQuickPick();
    this.renderLookup(lookup);
    this.quickPickVisible = true;
    this.quickPick?.show();
  }

  public closeActive(): void {
    this.quickPickVisible = false;
    this.disposeQuickPick();
    this.activeSession = undefined;
  }

  public syncWithActiveEditor(editor?: vscode.TextEditor): void {
    const activeEditor = editor ?? vscode.window.activeTextEditor;
    if (!this.activeSession) {
      return;
    }

    if (!activeEditor || activeEditor.document.uri.toString() !== this.activeSession.documentUri) {
      this.closeActive();
      return;
    }

    const lookup = this.controller.getSuggestionMenuLookup(activeEditor.document, activeEditor.selection.active);
    if (!lookup || lookup.key !== this.activeSession.key) {
      this.closeActive();
      return;
    }

    if (this.quickPickVisible) {
      this.renderLookup(lookup);
    }
  }

  private async handleSuggestionStateChange(event: SuggestionStateChangeEvent): Promise<void> {
    if (!this.activeSession || !this.quickPickVisible) {
      return;
    }

    if (event.documentUri && event.documentUri !== this.activeSession.documentUri) {
      return;
    }

    if (event.key && event.key !== this.activeSession.key) {
      return;
    }

    this.syncWithActiveEditor();
  }

  private ensureQuickPick(): void {
    if (this.quickPick) {
      return;
    }

    const quickPick = vscode.window.createQuickPick<SuggestionQuickPickItem>();
    quickPick.title = "🦖 Saurus";
    quickPick.placeholder = "Select a replacement below";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.ignoreFocusOut = false;

    quickPick.onDidAccept(() => {
      void this.acceptSelection();
    });

    quickPick.onDidHide(() => {
      this.quickPickVisible = false;
      this.disposeQuickPick();
      this.activeSession = undefined;
    });

    this.quickPick = quickPick;
  }

  private disposeQuickPick(): void {
    if (!this.quickPick) {
      return;
    }

    this.quickPickVisible = false;
    this.quickPick.dispose();
    this.quickPick = undefined;
  }

  private renderLookup(lookup: SuggestionMenuLookup): void {
    const quickPick = this.quickPick;
    if (!quickPick) {
      return;
    }

    const suggestions = buildCompletionSuggestions({
      sourceFilter: lookup.sourceFilter,
      hasEntry: Boolean(lookup.entry),
      thesaurusOptions: lookup.entry?.thesaurusOptions ?? [],
      aiOptions: lookup.entry?.aiOptions ?? [],
      thesaurusCached: lookup.entry?.thesaurusLastResponseCached ?? false,
      aiCached: lookup.entry?.aiLastResponseCached ?? false,
      aiProviderName: lookup.aiProviderName,
      thesaurusProvider: lookup.thesaurusProvider,
      thesaurusPrefix: lookup.thesaurusPrefix,
      aiPrefix: lookup.aiPrefix
    });

    const isGenerating = lookup.sourceStates.ai === "generating" || lookup.sourceStates.thesaurus === "generating";
    quickPick.busy = isGenerating;

    if (suggestions.length === 0) {
      const label = isGenerating
        ? "Generating suggestions..."
        : "No suggestions yet";
      const items: SuggestionQuickPickItem[] = [
        {
          rowKind: "status",
          rowId: isGenerating ? "status:generating" : "status:empty",
          label,
          detail: isGenerating ? "Saurus is still loading." : "Use Generate more or a source-specific action below.",
          alwaysShow: true
        }
      ];
      quickPick.items = this.buildActionRows(lookup, items);
      this.restoreActiveSelection(quickPick);
      return;
    }

    const items: SuggestionQuickPickItem[] = suggestions.map((suggestion) => ({
      rowKind: "suggestion",
      rowId: suggestion.id,
      label: suggestion.label,
      detail: suggestion.detail,
      description: suggestion.source === "thesaurus" ? "Thesaurus" : "AI",
      suggestionText: suggestion.insertText
    }));

    if (isGenerating) {
      items.push({
        rowKind: "status",
        rowId: "status:updating",
        label: "Generating more suggestions...",
        detail: "Saurus will update this list in place.",
        alwaysShow: true
      });
    }

    quickPick.items = this.buildActionRows(lookup, items);
    this.restoreActiveSelection(quickPick);
  }

  private buildActionRows(
    lookup: SuggestionMenuLookup,
    existingItems: SuggestionQuickPickItem[]
  ): SuggestionQuickPickItem[] {
    const items = [...existingItems];
    const isGeneratingAny = lookup.sourceStates.ai === "generating" || lookup.sourceStates.thesaurus === "generating";
    const generateMoreTitle = lookup.sourceStates.ai === "generating" && lookup.aiActiveAction === "refresh"
      ? "Generating more..."
      : "Generate more";
    const generateWithPromptTitle = lookup.sourceStates.ai === "generating" && lookup.aiActiveAction === "refreshWithPrompt"
      ? "Generating w/ prompt..."
      : "Generate w/ prompt";

    items.push(
      {
        rowKind: "action",
        rowId: "action:refresh",
        label: `$(sparkle) ${generateMoreTitle}`,
        detail: "AI",
        commandName: "saurus.refreshSuggestions",
        alwaysShow: true
      },
      {
        rowKind: "action",
        rowId: "action:refreshWithPrompt",
        label: `$(comment-discussion) ${generateWithPromptTitle}`,
        detail: "AI",
        commandName: "saurus.refreshSuggestionsWithPrompt",
        alwaysShow: true
      },
      {
        rowKind: "action",
        rowId: "action:aiOnly",
        label: "$(wand) AI only",
        detail: lookup.sourceFilter === "aiOnly" ? "Current filter" : "Switch source filter",
        commandName: "saurus.showAiOnlySuggestions",
        alwaysShow: true
      },
      {
        rowKind: "action",
        rowId: "action:thesaurusOnly",
        label: "$(book) Thesaurus only",
        detail: lookup.sourceFilter === "thesaurusOnly" ? "Current filter" : "Switch source filter",
        commandName: "saurus.showThesaurusOnlySuggestions",
        alwaysShow: true
      }
    );

    return items;
  }

  private restoreActiveSelection(quickPick: vscode.QuickPick<SuggestionQuickPickItem>): void {
    const activeRowId = quickPick.activeItems[0]?.rowId;
    const preferred = (activeRowId && quickPick.items.find((item) => item.rowId === activeRowId))
      ?? quickPick.items.find((item) => item.rowKind === "suggestion")
      ?? quickPick.items.find((item) => item.rowKind === "action");
    if (preferred) {
      quickPick.activeItems = [preferred];
    }
  }

  private async acceptSelection(): Promise<void> {
    const quickPick = this.quickPick;
    const session = this.activeSession;
    if (!quickPick || !session) {
      return;
    }

    const selected = quickPick.selectedItems[0];
    if (!selected) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== session.documentUri) {
      this.closeActive();
      return;
    }

    if (selected.rowKind === "suggestion") {
      if (!selected.suggestionText) {
        return;
      }
      const didApply = await this.controller.applySuggestionAtActivePlaceholder(editor, selected.suggestionText, session.key);
      if (didApply) {
        this.closeActive();
      } else {
        this.syncWithActiveEditor(editor);
      }
      return;
    }

    if (selected.rowKind !== "action" || !selected.commandName) {
      return;
    }

    const lookup = this.controller.getSuggestionMenuLookup(editor.document, editor.selection.active);
    if (!lookup || lookup.key !== session.key) {
      this.syncWithActiveEditor(editor);
      return;
    }

    await vscode.commands.executeCommand(
      selected.commandName,
      editor.document.uri.toString(),
      lookup.match.innerRange.start.line,
      lookup.match.innerRange.start.character
    );
  }
}
