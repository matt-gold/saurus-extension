import * as vscode from "vscode";
import { ProblemFinderService } from "./internal/ProblemFinderService";
import { PlaceholderEditActions } from "./internal/PlaceholderEditActions";
import {
  GenerateForEditorOptions,
  SuggestionGenerationService
} from "./internal/SuggestionGenerationService";
import { PlaceholderSessionFactory } from "./internal/session";
import { SuggestionRequestBuilder } from "./internal/request";
import { SuggestionResultStore } from "./internal/store";
import { getSettings } from "../../config";
import {
  SaurusSettings,
  SuggestionActionLookup
} from "../../types";

type SaurusControllerFactories = {
  createProblemFinderService: (
    deps: ConstructorParameters<typeof ProblemFinderService>[0]
  ) => ProblemFinderService;
  createPlaceholderEditActions: (
    deps: ConstructorParameters<typeof PlaceholderEditActions>[0]
  ) => PlaceholderEditActions;
  createPlaceholderSessionFactory: (
    deps: ConstructorParameters<typeof PlaceholderSessionFactory>[0]
  ) => PlaceholderSessionFactory;
  createSuggestionRequestBuilder: () => SuggestionRequestBuilder;
  createSuggestionResultStore: (
    deps: ConstructorParameters<typeof SuggestionResultStore>[0]
  ) => SuggestionResultStore;
  createSuggestionGenerationService: (
    deps: ConstructorParameters<typeof SuggestionGenerationService>[0]
  ) => SuggestionGenerationService;
};

type SaurusControllerConstructionOptions = {
  extensionContext: vscode.ExtensionContext;
  schemaPath: string;
  problemFinderSchemaPath: string;
  persistentCachePath: string;
  factories: SaurusControllerFactories;
};

/** Coordinates Saurus application behavior and VS Code-facing workflows. */
export class SaurusController implements vscode.Disposable {
  private readonly refreshModeBySessionKey = new Map<string, "refresh" | "refreshWithPrompt">();
  private readonly problemFinderService: ProblemFinderService;
  private readonly placeholderEditActions: PlaceholderEditActions;
  private readonly placeholderSessionFactory: PlaceholderSessionFactory;
  private readonly suggestionRequestBuilder: SuggestionRequestBuilder;
  private readonly suggestionResultStore: SuggestionResultStore;
  private readonly suggestionGenerationService: SuggestionGenerationService;

  public constructor(options: SaurusControllerConstructionOptions) {
    this.problemFinderService = options.factories.createProblemFinderService({
      problemFinderSchemaPath: options.problemFinderSchemaPath,
      getSettings: (document) => this.getSettings(document)
    });
    this.suggestionResultStore = options.factories.createSuggestionResultStore({
      persistentCachePath: options.persistentCachePath,
      getSettings: () => this.getSettings(),
      notifyChange: () => this.notifySuggestionActionsChanged()
    });
    this.placeholderSessionFactory = options.factories.createPlaceholderSessionFactory({
      getSettings: (document) => this.getSettings(document),
      store: this.suggestionResultStore
    });
    this.suggestionRequestBuilder = options.factories.createSuggestionRequestBuilder();
    this.placeholderEditActions = options.factories.createPlaceholderEditActions({
      getSettings: (document) => this.getSettings(document),
      getSuggestionKeyAtPosition: (document, position) => this.getSuggestionKeyAtPosition(document, position),
      clearAiActionForKey: (key) => this.refreshModeBySessionKey.delete(key)
    });
    this.suggestionGenerationService = options.factories.createSuggestionGenerationService({
      extensionContext: options.extensionContext,
      schemaPath: options.schemaPath,
      getSettings: (document) => this.getSettings(document),
      sessionFactory: this.placeholderSessionFactory,
      requestBuilder: this.suggestionRequestBuilder,
      resultStore: this.suggestionResultStore,
      getRefreshMode: (key) => this.refreshModeBySessionKey.get(key),
      setRefreshMode: (key, mode) => {
        if (mode) {
          this.refreshModeBySessionKey.set(key, mode);
        } else {
          this.refreshModeBySessionKey.delete(key);
        }
      }
    });
  }

  public initialize(): void {
    this.suggestionResultStore.initialize();
  }

  public dispose(): void {
    this.problemFinderService.dispose();
    this.suggestionResultStore.dispose();
  }

  public getSettings(document?: vscode.TextDocument): SaurusSettings {
    return getSettings(document);
  }

  public isEnabledForDocument(document: vscode.TextDocument): boolean {
    const settings = this.getSettings(document);
    return settings.enabled && settings.languages.includes(document.languageId);
  }

  public getSessionAtPosition(document: vscode.TextDocument, position: vscode.Position) {
    return this.placeholderSessionFactory.getSession(document, position);
  }

  public getSuggestionActionLookup(document: vscode.TextDocument, position: vscode.Position): SuggestionActionLookup | undefined {
    const session = this.getSessionAtPosition(document, position);
    if (!session) {
      return undefined;
    }

    return {
      key: session.key,
      match: session.match,
      entry: session.entry,
      sourceStates: session.sourceStates,
      aiProviderName: session.providerLabel,
      aiConfiguredModel: session.configuredModel,
      isGenerating: session.isGenerating,
      hasSuggestions: session.hasSuggestions
    };
  }

  public getSuggestionKeyAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    return this.getSessionAtPosition(document, position)?.key;
  }

  public getPlaceholderPromptAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    return this.getSessionAtPosition(document, position)?.parsedContent.directionText || undefined;
  }

  public hasCachedEntry(key: string): boolean {
    return this.suggestionResultStore.hasEntry(key);
  }

  public invalidateDocument(document: vscode.TextDocument): void {
    const documentUri = document.uri.toString();
    this.suggestionResultStore.clearDocument(documentUri);
    for (const key of this.refreshModeBySessionKey.keys()) {
      if (key.startsWith(`${documentUri}::`)) {
        this.refreshModeBySessionKey.delete(key);
      }
    }
  }

  public async generateForEditor(editor: vscode.TextEditor, options: GenerateForEditorOptions): Promise<void> {
    await this.suggestionGenerationService.generateForEditor(editor, options);
  }

  public async suggestForSelection(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const settings = this.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      await this.generateForEditor(editor, {
        forceDifferent: false,
        showNoPlaceholderWarning: true,
        userInitiated: true
      });
      return;
    }

    const wrapped = await this.wrapSelectionInPlaceholder(editor, settings);
    if (!wrapped) {
      return;
    }

    await this.generateForEditor(editor, {
      forceDifferent: false,
      showNoPlaceholderWarning: false,
      userInitiated: true
    });
  }

  public async applySuggestion(
    uri?: string,
    line?: number,
    character?: number,
    suggestion?: string
  ): Promise<void> {
    await this.placeholderEditActions.applySuggestion(uri, line, character, suggestion);
  }

  public async clearPersistentCache(): Promise<void> {
    this.suggestionResultStore.clearAll();
    this.refreshModeBySessionKey.clear();

    try {
      await this.suggestionResultStore.deletePersistedCacheFile();
      this.notifySuggestionActionsChanged();
      void vscode.window.showInformationMessage("Saurus: persistent cache cleared.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Saurus: failed to clear persistent cache. ${message}`);
    }
  }

  public async removeAllPlaceholderDelimiters(editor: vscode.TextEditor): Promise<void> {
    const settings = this.getSettings(editor.document);
    const removedCount = await this.placeholderEditActions.removeAllPlaceholderDelimiters(editor, settings);
    if (removedCount === 0) {
      void vscode.window.showInformationMessage("Saurus: no placeholders found in this file.");
      return;
    }

    void vscode.window.showInformationMessage(
      `Saurus: removed delimiters from ${removedCount} placeholder${removedCount === 1 ? "" : "s"}.`
    );
  }

  public async findProblems(editor: vscode.TextEditor): Promise<void> {
    await this.problemFinderService.findProblems(editor);
  }

  public applyProblemDocumentChanges(
    document: vscode.TextDocument,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ): void {
    this.problemFinderService.applyDocumentChanges(document, contentChanges);
  }

  public refreshProblemDecorationsForEditor(editor: vscode.TextEditor | undefined): void {
    this.problemFinderService.refreshEditor(editor);
  }

  public refreshProblemDecorationsForVisibleEditors(): void {
    this.problemFinderService.refreshVisibleEditors();
  }

  public ignoreProblem(uriString?: string, problemId?: string): void {
    this.problemFinderService.ignoreProblem(uriString, problemId);
  }

  public fixProblem(uriString?: string, problemId?: string): void {
    this.problemFinderService.fixProblem(uriString, problemId);
  }

  public async convertProblemToStegoComment(uriString?: string, problemId?: string): Promise<void> {
    await this.problemFinderService.convertProblemToStegoComment(uriString, problemId);
  }

  public clearProblemsForDocument(document: vscode.TextDocument): void {
    this.problemFinderService.clearProblemsForDocument(document);
  }

  public reopenQuickFix(): Thenable<unknown> {
    return vscode.commands.executeCommand("editor.action.quickFix");
  }

  public async wrapSelectionInPlaceholder(editor: vscode.TextEditor, settings: SaurusSettings): Promise<boolean> {
    return this.placeholderEditActions.wrapSelectionInPlaceholder(editor, settings);
  }

  public async wrapSelectionInPlaceholderWithPrompt(
    editor: vscode.TextEditor,
    settings: SaurusSettings,
    direction?: string
  ): Promise<boolean> {
    return this.placeholderEditActions.wrapSelectionInPlaceholderWithPrompt(editor, settings, direction);
  }

  public async setPlaceholderPrompt(
    editor: vscode.TextEditor,
    settings: SaurusSettings,
    direction: string
  ): Promise<boolean> {
    return this.placeholderEditActions.setPlaceholderPrompt(editor, settings, direction);
  }

  private notifySuggestionActionsChanged(): void {
    // Quick Fix is pull-based; callers reopen it explicitly after state-changing actions.
  }
}
