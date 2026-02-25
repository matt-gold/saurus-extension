import * as vscode from "vscode";
import { PersistentCacheCoordinator } from "./internal/PersistentCacheCoordinator";
import { PlaceholderEditActions } from "./internal/PlaceholderEditActions";
import {
  AiSemanticCacheEntry,
  GenerateForEditorOptions,
  SuggestionGenerationService,
  ThesaurusSemanticCacheEntry
} from "./internal/SuggestionGenerationService";
import { getSettings } from "../../config";
import {
  addSuggestionsToSeen,
  buildAiSemanticCacheKey,
  buildThesaurusSemanticCacheKey,
  extractContextFromDocument,
  hashText,
  normalizeAiAdjacentContext
} from "../../core/suggestions";
import { findPlaceholderAtPosition } from "../../core/placeholder";
import { getAiProviderLabel } from "../../services/ai";
import { SuggestionCache } from "../../state";
import {
  PlaceholderMatch,
  SaurusSettings,
  SuggestionSourceFilter,
  SourceGenerationStates,
  SuggestionCacheEntry,
  SuggestionKeyData,
} from "../../types";
import { refreshSuggestWidget } from "../../ui/suggest";

/** Describes completion-provider lookup data for an active placeholder session. */
export type CompletionLookup = {
  key: string;
  match: PlaceholderMatch;
  entry?: SuggestionCacheEntry;
  sourceStates: SourceGenerationStates;
  sourceFilter: SuggestionSourceFilter;
  aiAutoRun: boolean;
  aiProviderName: string;
  aiConfiguredModel?: string;
  thesaurusPrefix: string;
  aiPrefix: string;
  aiActiveAction?: "refresh" | "refreshWithPrompt";
  thesaurusProvider: SaurusSettings["thesaurusProvider"];
  preferRefreshSelection: boolean;
};

type SaurusControllerFactories = {
  createPersistentCacheCoordinator: (
    deps: ConstructorParameters<typeof PersistentCacheCoordinator>[0]
  ) => PersistentCacheCoordinator;
  createPlaceholderEditActions: (
    deps: ConstructorParameters<typeof PlaceholderEditActions>[0]
  ) => PlaceholderEditActions;
  createSuggestionGenerationService: (
    deps: ConstructorParameters<typeof SuggestionGenerationService>[0]
  ) => SuggestionGenerationService;
};

type SaurusControllerConstructionOptions = {
  extensionContext: vscode.ExtensionContext;
  schemaPath: string;
  persistentCachePath: string;
  factories: SaurusControllerFactories;
};

/** Coordinates Saurus application behavior and VS Code-facing workflows. */
export class SaurusController implements vscode.Disposable {
  private readonly cache = new SuggestionCache();
  private readonly thesaurusSemanticCache = new Map<string, ThesaurusSemanticCacheEntry>();
  private readonly aiSemanticCache = new Map<string, AiSemanticCacheEntry>();
  private readonly completionItemsChangedEmitter = new vscode.EventEmitter<void>();
  private readonly preferRefreshSelectionKeys = new Set<string>();
  private readonly sourceFilterByKey = new Map<string, SuggestionSourceFilter>();
  private readonly aiActionByKey = new Map<string, "refresh" | "refreshWithPrompt">();
  private readonly persistentCacheCoordinator: PersistentCacheCoordinator;
  private readonly placeholderEditActions: PlaceholderEditActions;
  private readonly suggestionGenerationService: SuggestionGenerationService;

  public readonly onDidChangeCompletionItems = this.completionItemsChangedEmitter.event;

  public constructor(options: SaurusControllerConstructionOptions) {
    this.persistentCacheCoordinator = options.factories.createPersistentCacheCoordinator({
      cache: this.cache,
      persistentCachePath: options.persistentCachePath,
      getSettings: () => this.getSettings(),
      notifyCompletionItemsChanged: () => this.notifyCompletionItemsChanged()
    });
    this.placeholderEditActions = options.factories.createPlaceholderEditActions({
      getSettings: (document) => this.getSettings(document),
      getSuggestionKeyAtPosition: (document, position) => this.getSuggestionKeyAtPosition(document, position),
      clearPreferRefreshSelectionForKey: (key) => this.preferRefreshSelectionKeys.delete(key),
      clearSourceFilterForKey: (key) => this.sourceFilterByKey.delete(key),
      clearAiActionForKey: (key) => this.aiActionByKey.delete(key)
    });
    this.suggestionGenerationService = options.factories.createSuggestionGenerationService({
      extensionContext: options.extensionContext,
      schemaPath: options.schemaPath,
      cache: this.cache,
      thesaurusSemanticCache: this.thesaurusSemanticCache,
      aiSemanticCache: this.aiSemanticCache,
      sourceFilterByKey: this.sourceFilterByKey,
      aiActionByKey: this.aiActionByKey,
      getSettings: (document) => this.getSettings(document),
      buildSuggestionKeyData: (document, match, settings) => this.buildSuggestionKeyData(document, match, settings),
      hydrateUiEntryFromSemanticCaches: (suggestionKey, keyData, document, existingEntry) =>
        this.hydrateUiEntryFromSemanticCaches(suggestionKey, keyData, document, existingEntry),
      updateSourceStatesForEntry: (key, entry, settings, documentUri) =>
        this.updateSourceStatesForEntry(key, entry, settings, documentUri),
      mapActivationModeToSourceFilter: (mode) => this.mapActivationModeToSourceFilter(mode),
      schedulePersistentCacheSave: () => this.schedulePersistentCacheSave(),
      notifyCompletionItemsChanged: () => this.notifyCompletionItemsChanged()
    });
  }

  public initialize(): void {
    this.hydratePersistentCache();
  }

  public dispose(): void {
    this.persistentCacheCoordinator.dispose();
    this.completionItemsChangedEmitter.dispose();
  }

  public getSettings(document?: vscode.TextDocument): SaurusSettings {
    return getSettings(document);
  }

  public isEnabledForDocument(document: vscode.TextDocument): boolean {
    const settings = this.getSettings(document);
    return settings.enabled && settings.languages.includes(document.languageId);
  }

  public shouldAutoTrigger(document: vscode.TextDocument): boolean {
    const settings = this.getSettings(document);
    return settings.enabled && settings.autoTriggerOnCursorEnter && settings.languages.includes(document.languageId);
  }

  public getAutoDebounceMs(document: vscode.TextDocument): number {
    return this.getSettings(document).autoTriggerDebounceMs;
  }

  public getActivationSourceFilter(document: vscode.TextDocument): SuggestionSourceFilter {
    return this.mapActivationModeToSourceFilter(this.getSettings(document).activationModeOnEnter);
  }

  public setSourceFilterForKey(key: string, sourceFilter: SuggestionSourceFilter): void {
    this.sourceFilterByKey.set(key, sourceFilter);
  }

  public getCompletionLookup(document: vscode.TextDocument, position: vscode.Position): CompletionLookup | undefined {
    const settings = this.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return undefined;
    }

    const match = findPlaceholderAtPosition(document, position, settings.delimiters);
    if (!match) {
      return undefined;
    }

    const keyData = this.buildSuggestionKeyData(document, match, settings);
    const cachedEntry = this.hydrateUiEntryFromSemanticCaches(
      keyData.key,
      keyData,
      document,
      this.cache.getEntry(keyData.key)
    );
    if (cachedEntry) {
      this.schedulePersistentCacheSave();
    }

    const entry = cachedEntry
      ? {
        ...cachedEntry,
        thesaurusOptions: settings.thesaurusEnabled ? cachedEntry.thesaurusOptions : []
      }
      : undefined;

    return {
      key: keyData.key,
      match,
      entry,
      sourceStates: this.cache.getSourceStates(keyData.key),
      sourceFilter: this.sourceFilterByKey.get(keyData.key) ?? this.getActivationSourceFilter(document),
      aiAutoRun: settings.aiAutoRun,
      aiProviderName: getAiProviderLabel(settings.aiProvider),
      aiConfiguredModel: settings.aiModel,
      thesaurusPrefix: settings.thesaurusPrefix,
      aiPrefix: settings.aiPrefix,
      aiActiveAction: this.aiActionByKey.get(keyData.key),
      thesaurusProvider: settings.thesaurusProvider,
      preferRefreshSelection: this.preferRefreshSelectionKeys.has(keyData.key)
    };
  }

  public getSuggestionKeyAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    const settings = this.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return undefined;
    }

    const match = findPlaceholderAtPosition(document, position, settings.delimiters);
    if (!match) {
      return undefined;
    }

    return this.buildSuggestionKeyData(document, match, settings).key;
  }

  public hasCachedEntry(key: string): boolean {
    return this.cache.hasEntry(key);
  }

  public setPreferRefreshSelectionForKey(key: string, prefer: boolean): void {
    if (prefer) {
      this.preferRefreshSelectionKeys.add(key);
      return;
    }

    this.preferRefreshSelectionKeys.delete(key);
  }

  public invalidateDocument(document: vscode.TextDocument): void {
    const documentUri = document.uri.toString();
    this.cache.clearDocument(documentUri);
    for (const key of this.preferRefreshSelectionKeys) {
      if (key.startsWith(`${documentUri}::`)) {
        this.preferRefreshSelectionKeys.delete(key);
      }
    }
    for (const key of this.sourceFilterByKey.keys()) {
      if (key.startsWith(`${documentUri}::`)) {
        this.sourceFilterByKey.delete(key);
      }
    }
    for (const key of this.aiActionByKey.keys()) {
      if (key.startsWith(`${documentUri}::`)) {
        this.aiActionByKey.delete(key);
      }
    }

    this.schedulePersistentCacheSave();
    this.notifyCompletionItemsChanged();
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
        sourceFilter: "all",
        showNoPlaceholderWarning: true,
        userInitiated: true
      });
      await refreshSuggestWidget({ hard: true, repeat: 2 });
      return;
    }

    const wrapped = await this.wrapSelectionInPlaceholder(editor, settings);
    if (!wrapped) {
      return;
    }

    await this.generateForEditor(editor, {
      forceDifferent: false,
      sourceFilter: "all",
      showNoPlaceholderWarning: false,
      userInitiated: true
    });
    await refreshSuggestWidget({ hard: true, repeat: 2 });
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
    this.cache.clearAll();
    this.preferRefreshSelectionKeys.clear();
    this.sourceFilterByKey.clear();
    this.aiActionByKey.clear();
    this.persistentCacheCoordinator.cancelPendingSave();

    try {
      await this.persistentCacheCoordinator.deletePersistedCacheFile();
      this.notifyCompletionItemsChanged();
      void vscode.window.showInformationMessage("Saurus: persistent cache cleared.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      void vscode.window.showErrorMessage(`Saurus: failed to clear persistent cache. ${message}`);
    }
  }

  private notifyCompletionItemsChanged(): void {
    this.completionItemsChangedEmitter.fire();
  }

  private hydrateUiEntryFromSemanticCaches(
    suggestionKey: string,
    keyData: SuggestionKeyData,
    document: vscode.TextDocument,
    existingEntry?: SuggestionCacheEntry
  ): SuggestionCacheEntry | undefined {
    const thesaurusSemantic = this.thesaurusSemanticCache.get(keyData.thesaurusCacheKey);
    const aiSemantic = this.aiSemanticCache.get(keyData.aiCacheKey);

    if (!existingEntry && !thesaurusSemantic && !aiSemantic) {
      return undefined;
    }

    let nextEntry = existingEntry
      ? {
        ...existingEntry,
        thesaurusOptions: [...existingEntry.thesaurusOptions],
        aiOptions: [...existingEntry.aiOptions],
        seenNormalized: new Set<string>(existingEntry.seenNormalized),
        seenRaw: [...existingEntry.seenRaw]
      }
      : this.createEmptyUiCacheEntry(document);

    let changed = !existingEntry;

    if (thesaurusSemantic && nextEntry.thesaurusOptions.length === 0) {
      nextEntry = {
        ...nextEntry,
        thesaurusOptions: [...thesaurusSemantic.options],
        thesaurusInfo: thesaurusSemantic.info,
        thesaurusLastResponseCached: true
      };
      changed = true;
    }

    if (aiSemantic && nextEntry.aiOptions.length === 0) {
      nextEntry = {
        ...nextEntry,
        aiOptions: [...aiSemantic.options],
        lastAiPrompt: aiSemantic.lastPrompt,
        lastAiModel: aiSemantic.lastModel,
        aiLoadedCount: aiSemantic.options.length,
        aiLastAddedCount: 0,
        aiLastResponseCached: true
      };
      changed = true;
    }

    if (!changed) {
      return existingEntry;
    }

    const seenNormalized = new Set<string>();
    const seenRaw: string[] = [];
    addSuggestionsToSeen(nextEntry.thesaurusOptions, seenNormalized, seenRaw);
    addSuggestionsToSeen(nextEntry.aiOptions, seenNormalized, seenRaw);
    nextEntry = {
      ...nextEntry,
      seenNormalized,
      seenRaw,
      lastAccessedAt: Date.now()
    };

    this.cache.setEntry(suggestionKey, nextEntry);
    return nextEntry;
  }

  private createEmptyUiCacheEntry(document: vscode.TextDocument): SuggestionCacheEntry {
    const now = Date.now();
    return {
      thesaurusOptions: [],
      aiOptions: [],
      thesaurusLastResponseCached: true,
      aiLoadedCount: 0,
      aiLastAddedCount: 0,
      aiLastResponseCached: true,
      seenNormalized: new Set<string>(),
      seenRaw: [],
      createdAt: now,
      documentVersion: document.version,
      documentUri: document.uri.toString(),
      lastAccessedAt: now
    };
  }

  public async exitPlaceholderSuggestions(uri?: string, line?: number, character?: number): Promise<void> {
    await this.placeholderEditActions.exitPlaceholderSuggestions(uri, line, character);
  }

  public async wrapSelectionInPlaceholder(editor: vscode.TextEditor, settings: SaurusSettings): Promise<boolean> {
    return this.placeholderEditActions.wrapSelectionInPlaceholder(editor, settings);
  }

  private hydratePersistentCache(): void {
    this.persistentCacheCoordinator.hydrate();
  }

  private schedulePersistentCacheSave(): void {
    this.persistentCacheCoordinator.scheduleSave();
  }

  private buildSuggestionKeyData(
    document: vscode.TextDocument,
    match: PlaceholderMatch,
    settings: SaurusSettings
  ): SuggestionKeyData {
    const context = extractContextFromDocument(
      document,
      match.fullRange,
      settings.contextCharsBefore,
      settings.contextCharsAfter
    );

    const promptTemplateHash = hashText(settings.promptTemplate);
    const aiPathForKey = settings.aiProvider === "copilotChat" ? "" : settings.aiPath;
    const aiContextBefore = normalizeAiAdjacentContext(context.contextBefore, settings.delimiters);
    const aiContextAfter = normalizeAiAdjacentContext(context.contextAfter, settings.delimiters);

    const payload = JSON.stringify({
      uri: document.uri.toString(),
      line: match.fullRange.start.line,
      startCharacter: match.fullRange.start.character,
      endCharacter: match.fullRange.end.character,
      placeholder: match.rawInnerText,
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
      open: settings.delimiters.open,
      close: settings.delimiters.close,
      aiProvider: settings.aiProvider,
      aiPath: aiPathForKey,
      aiModel: settings.aiModel ?? "",
      aiReasoningEffort: settings.aiReasoningEffort,
      promptTemplateHash
    });

    return {
      key: `${document.uri.toString()}::${hashText(payload)}`,
      aiCacheKey: buildAiSemanticCacheKey({
        placeholder: match.rawInnerText,
        contextBefore: aiContextBefore,
        contextAfter: aiContextAfter,
        aiProvider: settings.aiProvider,
        aiPath: aiPathForKey,
        aiModel: settings.aiModel,
        aiReasoningEffort: settings.aiReasoningEffort,
        promptTemplateHash
      }),
      thesaurusCacheKey: buildThesaurusSemanticCacheKey({
        provider: settings.thesaurusProvider,
        rawPlaceholder: match.rawInnerText
      }),
      contextBefore: aiContextBefore,
      contextAfter: aiContextAfter,
      promptTemplateHash
    };
  }

  private updateSourceStatesForEntry(
    key: string,
    entry: SuggestionCacheEntry,
    settings: SaurusSettings,
    documentUri: string
  ): void {
    const thesaurusState = settings.thesaurusEnabled
      ? (entry.thesaurusOptions.length > 0 ? "ready" : "idle")
      : "idle";
    const aiState = entry.aiOptions.length > 0 ? "ready" : "idle";

    this.cache.setSourceState(key, "thesaurus", thesaurusState, documentUri);
    this.cache.setSourceState(key, "ai", aiState, documentUri);
    this.notifyCompletionItemsChanged();
  }

  private mapActivationModeToSourceFilter(mode: SaurusSettings["activationModeOnEnter"]): SuggestionSourceFilter {
    if (mode === "ai") {
      return "aiOnly";
    }
    if (mode === "thesaurus") {
      return "thesaurusOnly";
    }
    return "all";
  }

}
