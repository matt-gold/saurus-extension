import * as path from "path";
import * as vscode from "vscode";
import { disableAutoTriggerForWorkspace, getSettings } from "./config";
import { extractContextFromDocument } from "./context";
import {
  AiAuthError,
  AiCliMissingError,
  AiRequestError,
  generateSuggestionsWithAi
} from "./codexClient";
import { getAiProviderLabel } from "./aiProvider";
import { appendDirectionGuidance, hashText, renderPromptTemplate, toPromptVariables } from "./prompt";
import { findPlaceholderAtPosition } from "./placeholder";
import { addSuggestionsToSeen, dedupeSuggestions } from "./normalize";
import { SuggestionCache } from "./cache";
import { canUseCopilotChatInBackground, generateSuggestionsWithCopilotChat } from "./copilotChatClient";
import {
  CopilotChatBlockedError,
  CopilotChatConsentRequiredError,
  CopilotChatRequestError,
  CopilotChatUnavailableError
} from "./copilotChatCore";
import {
  PlaceholderMatch,
  SaurusSettings,
  SuggestionResponse,
  SuggestionSourceFilter,
  SourceGenerationStates,
  SuggestionCacheEntry,
  SuggestionRequest,
  SuggestionKeyData,
  ThesaurusLookupInfo
} from "./types";
import {
  createThesaurusProvider,
  extractThesaurusLookupTerm,
  ThesaurusConfigError,
  ThesaurusLookupResult,
  ThesaurusRequestError
} from "./thesaurusClient";
import {
  deletePersistedCache,
  loadPersistedCache,
  pruneExpiredEntries,
  savePersistedCache
} from "./persistentCache";
import {
  hideSuggestWidget,
  refreshSuggestWidget,
  refreshSuggestWidgetStable,
  triggerSuggestWidget
} from "./suggestWidgetCoordinator";

const PERSISTED_CACHE_FILENAME = "saurus-cache-v1.json";
const PERSIST_SAVE_DEBOUNCE_MS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CompletionLookup {
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
}

interface GenerateOptions {
  forceDifferent: boolean;
  sourceFilter?: SuggestionSourceFilter;
  promptDirection?: string;
  showNoPlaceholderWarning?: boolean;
  quietErrors?: boolean;
  userInitiated?: boolean;
}

export class SaurusController implements vscode.Disposable {
  private readonly cache = new SuggestionCache();
  private readonly schemaPath: string;
  private readonly persistentCachePath: string;
  private readonly completionItemsChangedEmitter = new vscode.EventEmitter<void>();
  private readonly preferRefreshSelectionKeys = new Set<string>();
  private readonly sourceFilterByKey = new Map<string, SuggestionSourceFilter>();
  private readonly aiActionByKey = new Map<string, "refresh" | "refreshWithPrompt">();
  private persistSaveTimer: NodeJS.Timeout | undefined;
  private persistSaveInFlight = false;
  private persistSaveQueued = false;

  public readonly onDidChangeCompletionItems = this.completionItemsChangedEmitter.event;

  public constructor(private readonly extensionContext: vscode.ExtensionContext) {
    this.schemaPath = extensionContext.asAbsolutePath(path.join("resources", "suggestions.schema.json"));
    this.persistentCachePath = path.join(extensionContext.globalStorageUri.fsPath, PERSISTED_CACHE_FILENAME);
    this.hydratePersistentCache();
  }

  public dispose(): void {
    if (this.persistSaveTimer) {
      clearTimeout(this.persistSaveTimer);
      this.persistSaveTimer = undefined;
    }

    void this.flushPersistentCache();
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
    const cachedEntry = this.cache.getEntry(keyData.key);
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

  public async generateForEditor(editor: vscode.TextEditor, options: GenerateOptions): Promise<void> {
    const document = editor.document;
    const settings = this.getSettings(document);

    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return;
    }

    const position = editor.selection.active;
    const match = findPlaceholderAtPosition(document, position, settings.delimiters);

    if (!match) {
      if (options.showNoPlaceholderWarning) {
        void vscode.window.showInformationMessage(
          "Saurus: place the cursor inside a configured placeholder to generate suggestions."
        );
      }
      return;
    }

    const keyData = this.buildSuggestionKeyData(document, match, settings);
    const suggestionKey = keyData.key;
    const documentUri = document.uri.toString();
    const existingEntry = this.cache.getEntry(suggestionKey);
    const sourceFilter = options.sourceFilter
      ?? this.sourceFilterByKey.get(suggestionKey)
      ?? this.mapActivationModeToSourceFilter(settings.activationModeOnEnter);
    this.setSourceFilterForKey(suggestionKey, sourceFilter);

    const isUserInitiated = options.userInitiated ?? true;
    // `ai.autoGenerateOnOpen` should gate auto-trigger behavior, not explicit user commands.
    const shouldRunAi = sourceFilter !== "thesaurusOnly" && (
      options.forceDifferent ||
      settings.aiAutoRun ||
      isUserInitiated
    );
    const shouldRunThesaurus = sourceFilter !== "aiOnly" && settings.thesaurusEnabled;
    let aiAllowedForThisRun = true;
    if (shouldRunAi && settings.aiProvider === "copilotChat" && !isUserInitiated) {
      aiAllowedForThisRun = await canUseCopilotChatInBackground(this.extensionContext, settings.aiModel);
    }
    const needsThesaurus = shouldRunThesaurus && (!existingEntry || existingEntry.thesaurusOptions.length === 0);
    const needsAi = aiAllowedForThisRun && shouldRunAi && (options.forceDifferent || !existingEntry || existingEntry.aiOptions.length === 0);

    if (!needsThesaurus && !needsAi) {
      if (existingEntry) {
        const cachedEntry: SuggestionCacheEntry = {
          ...existingEntry,
          thesaurusLastResponseCached: true,
          aiLoadedCount: existingEntry.aiOptions.length,
          aiLastAddedCount: 0,
          aiLastResponseCached: true,
          lastAccessedAt: Date.now()
        };
        this.cache.setEntry(suggestionKey, cachedEntry);
        this.updateSourceStatesForEntry(suggestionKey, cachedEntry, settings, documentUri);
        this.schedulePersistentCacheSave();
      }
      return;
    }

    if (needsAi && options.forceDifferent) {
      this.aiActionByKey.set(
        suggestionKey,
        options.promptDirection?.trim() ? "refreshWithPrompt" : "refresh"
      );
    } else {
      this.aiActionByKey.delete(suggestionKey);
    }

    if (needsThesaurus) {
      this.cache.setSourceState(suggestionKey, "thesaurus", "generating", documentUri);
    }
    if (needsAi) {
      this.cache.setSourceState(suggestionKey, "ai", "generating", documentUri);
    }
    if (needsThesaurus || needsAi) {
      this.notifyCompletionItemsChanged();
    }

    const loadingSources: string[] = [];
    if (needsThesaurus) {
      loadingSources.push("thesaurus");
    }
    if (needsAi) {
      loadingSources.push("AI");
    }
    const loadingMessage = vscode.window.setStatusBarMessage(
      `$(loading~spin) Saurus: loading ${loadingSources.join(" + ")} suggestions...`
    );

    const requestVersion = document.version;
    let newlyAddedAiOptions = 0;
    let aiAttempted = false;
    let aiFailed = false;

    try {
      await this.cache.runExclusive(suggestionKey, async () => {
        const entryAtStart = this.cache.getEntry(suggestionKey) ?? existingEntry;
        let thesaurusOptions = entryAtStart ? [...entryAtStart.thesaurusOptions] : [];
        let aiOptions = entryAtStart ? [...entryAtStart.aiOptions] : [];
        let thesaurusInfo: ThesaurusLookupInfo | undefined = entryAtStart?.thesaurusInfo;
        let thesaurusLastResponseCached = needsThesaurus
          ? (entryAtStart?.thesaurusLastResponseCached ?? true)
          : true;
        let lastAiPrompt: string | undefined = entryAtStart?.lastAiPrompt;
        let lastAiModel: string | undefined = entryAtStart?.lastAiModel;
        let aiLoadedCount = entryAtStart?.aiLoadedCount ?? aiOptions.length;
        let aiLastAddedCount = 0;
        let aiLastResponseCached = !needsAi;
        const seenNormalized = new Set<string>(entryAtStart?.seenNormalized ?? []);
        const seenRaw = entryAtStart ? [...entryAtStart.seenRaw] : [];

        const buildCurrentEntry = (): SuggestionCacheEntry => ({
          thesaurusOptions,
          aiOptions,
          thesaurusInfo,
          thesaurusLastResponseCached,
          lastAiPrompt,
          lastAiModel,
          aiLoadedCount,
          aiLastAddedCount,
          aiLastResponseCached,
          seenNormalized,
          seenRaw,
          createdAt: entryAtStart?.createdAt ?? Date.now(),
          documentVersion: requestVersion,
          documentUri,
          lastAccessedAt: Date.now()
        });

        addSuggestionsToSeen(thesaurusOptions, seenNormalized, seenRaw);
        addSuggestionsToSeen(aiOptions, seenNormalized, seenRaw);

        if (needsThesaurus) {
          try {
            const fetched = await this.fetchThesaurusSuggestions(match.rawInnerText, settings);

            if (document.version !== requestVersion) {
              this.cache.setSourceState(suggestionKey, "thesaurus", "idle", documentUri);
              this.cache.setSourceState(suggestionKey, "ai", "idle", documentUri);
              this.notifyCompletionItemsChanged();
              return;
            }

            const deduped = dedupeSuggestions(fetched.suggestions, new Set<string>(), settings.thesaurusMaxSuggestions);
            thesaurusOptions = deduped;
            thesaurusInfo = {
              ...fetched.info,
              suggestionCount: deduped.length
            };
            thesaurusLastResponseCached = false;
            addSuggestionsToSeen(deduped, seenNormalized, seenRaw);
            this.cache.setEntry(suggestionKey, buildCurrentEntry());
            this.cache.setSourceState(suggestionKey, "thesaurus", "ready", documentUri);
            this.notifyCompletionItemsChanged();
            if (needsAi) {
              void triggerSuggestWidget();
            }
          } catch (error) {
            this.cache.setSourceState(suggestionKey, "thesaurus", "error", documentUri);
            this.notifyCompletionItemsChanged();
            if (!options.quietErrors) {
              void vscode.window.showErrorMessage(`Saurus thesaurus: ${this.getErrorMessage(error)}`);
            }
          }
        }

        if (needsAi) {
          aiAttempted = true;
          const request: SuggestionRequest = {
            placeholder: match.rawInnerText,
            contextBefore: keyData.contextBefore,
            contextAfter: keyData.contextAfter,
            suggestionCount: settings.suggestionCount,
            avoidSuggestions: seenRaw,
            direction: options.promptDirection?.trim() ?? "",
            fileName: path.basename(document.fileName),
            languageId: document.languageId
          };

          const renderedPrompt = renderPromptTemplate(settings.promptTemplate, toPromptVariables(request));
          const finalPrompt = appendDirectionGuidance(renderedPrompt, request.direction);
          lastAiPrompt = finalPrompt;
          lastAiModel = settings.aiModel?.trim().length ? settings.aiModel.trim() : undefined;

          try {
            const response = await this.generateAiSuggestions(
              settings,
              document,
              finalPrompt,
              isUserInitiated
            );

            if (document.version !== requestVersion) {
              this.cache.setSourceState(suggestionKey, "thesaurus", "idle", documentUri);
              this.cache.setSourceState(suggestionKey, "ai", "idle", documentUri);
              this.notifyCompletionItemsChanged();
              return;
            }

            const nextOptions = dedupeSuggestions(response.suggestions, seenNormalized, settings.suggestionCount);
            newlyAddedAiOptions = nextOptions.length;
            aiLastAddedCount = nextOptions.length;
            addSuggestionsToSeen(nextOptions, seenNormalized, seenRaw);

            aiOptions = [...aiOptions, ...nextOptions];
            aiLoadedCount = aiOptions.length;
            aiLastResponseCached = false;
            this.cache.setEntry(suggestionKey, buildCurrentEntry());
            this.cache.setSourceState(suggestionKey, "ai", "ready", documentUri);
            this.notifyCompletionItemsChanged();
          } catch (error) {
            aiFailed = true;
            aiLastAddedCount = 0;
            aiLoadedCount = aiOptions.length;
            aiLastResponseCached = true;
            this.cache.setEntry(suggestionKey, buildCurrentEntry());
            if (aiOptions.length > 0) {
              this.cache.setSourceState(suggestionKey, "ai", "ready", documentUri);
            } else {
              this.cache.setSourceState(suggestionKey, "ai", "error", documentUri);
            }
            this.notifyCompletionItemsChanged();

            if (!options.quietErrors) {
              void vscode.window.showErrorMessage(`Saurus AI: ${this.getErrorMessage(error)}`);
            }
          }
        }

        if (document.version !== requestVersion) {
          this.cache.setSourceState(suggestionKey, "thesaurus", "idle", documentUri);
          this.cache.setSourceState(suggestionKey, "ai", "idle", documentUri);
          this.notifyCompletionItemsChanged();
          return;
        }

        const nextEntry = buildCurrentEntry();
        this.cache.setEntry(suggestionKey, nextEntry);
        this.updateSourceStatesForEntry(suggestionKey, nextEntry, settings, documentUri);
        this.schedulePersistentCacheSave();
      });
    } finally {
      if (needsAi) {
        this.aiActionByKey.delete(suggestionKey);
        this.notifyCompletionItemsChanged();
      }
      loadingMessage.dispose();
    }

    if (options.forceDifferent && aiAttempted && !aiFailed && newlyAddedAiOptions === 0) {
      void vscode.window.setStatusBarMessage("Saurus: no novel AI options found for this placeholder.", 3000);
    }
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

  public registerCommands(subscriptions: vscode.Disposable[]): void {
    subscriptions.push(
      vscode.commands.registerCommand("saurus.generateSuggestions", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const generationPromise = this.generateForEditor(editor, {
          forceDifferent: false,
          showNoPlaceholderWarning: true,
          userInitiated: true
        });
        const key = this.getSuggestionKeyAtPosition(editor.document, editor.selection.active);
        if (key) {
          this.preferRefreshSelectionKeys.delete(key);
        }

        await refreshSuggestWidget({ repeat: 2 });
        await generationPromise;
        await refreshSuggestWidget({ hard: true, repeat: 2 });
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.suggestForSelection", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        await this.suggestForSelection(editor);
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.suggestForSelectionWithPrompt", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const initialSelection = new vscode.Selection(
          editor.selection.start,
          editor.selection.end
        );

        const direction = await vscode.window.showInputBox({
          title: "Saurus: Generate With Prompt",
          prompt: "Enter a short direction for this AI generation run.",
          placeHolder: "Example: more lyrical, keep meaning intact",
          ignoreFocusOut: true
        });
        if (direction === undefined) {
          return;
        }

        const promptDirection = direction.trim();
        if (promptDirection.length === 0) {
          void vscode.window.showInformationMessage("Saurus: prompt direction cannot be empty.");
          return;
        }

        const document = editor.document;
        const settings = this.getSettings(document);
        if (!settings.enabled || !settings.languages.includes(document.languageId)) {
          return;
        }

        if (initialSelection.isEmpty) {
          await runRefreshWithOptionalDirection(promptDirection);
          return;
        }

        editor.selection = new vscode.Selection(initialSelection.start, initialSelection.end);

        const wrapped = await this.wrapSelectionInPlaceholder(editor, settings);
        if (!wrapped) {
          return;
        }

        const key = this.getSuggestionKeyAtPosition(editor.document, editor.selection.active);
        if (key) {
          this.preferRefreshSelectionKeys.add(key);
        }

        const generationPromise = this.generateForEditor(editor, {
          forceDifferent: true,
          sourceFilter: "all",
          promptDirection,
          showNoPlaceholderWarning: false,
          userInitiated: true
        });

        await refreshSuggestWidget({ repeat: 2 });
        await generationPromise;
        await refreshSuggestWidget({ hard: true, repeat: 2 });
      })
    );

    const runRefreshWithOptionalDirection = async (
      promptDirection: string | undefined,
      uri?: string,
      line?: number,
      character?: number
    ): Promise<void> => {
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

      const generationPromise = this.generateForEditor(editor, {
        forceDifferent: true,
        promptDirection,
        showNoPlaceholderWarning: true,
        userInitiated: true
      });
      const key = this.getSuggestionKeyAtPosition(editor.document, editor.selection.active);
      if (key) {
        this.preferRefreshSelectionKeys.add(key);
      }

      await refreshSuggestWidget({ repeat: 2 });
      await generationPromise;
      await refreshSuggestWidgetStable();
    };

    const runSourceFilteredGeneration = async (
      sourceFilter: SuggestionSourceFilter,
      uri?: string,
      line?: number,
      character?: number
    ): Promise<void> => {
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

      const settings = this.getSettings(editor.document);
      if (!settings.enabled || !settings.languages.includes(editor.document.languageId)) {
        return;
      }

      if (editor.selection && !editor.selection.isEmpty) {
        const wrapped = await this.wrapSelectionInPlaceholder(editor, settings);
        if (!wrapped) {
          return;
        }
      }

      const lookup = this.getCompletionLookup(editor.document, editor.selection.active);
      if (!lookup) {
        void vscode.window.showInformationMessage(
          "Saurus: place the cursor inside a configured placeholder to use source-specific suggestions."
        );
        return;
      }

      this.sourceFilterByKey.set(lookup.key, sourceFilter);
      if (sourceFilter === "aiOnly") {
        this.preferRefreshSelectionKeys.add(lookup.key);
      } else {
        this.preferRefreshSelectionKeys.delete(lookup.key);
      }

      const forceDifferent = sourceFilter === "aiOnly"
        ? lookup.entry?.aiOptions.length === 0
        : false;

      const generationPromise = this.generateForEditor(editor, {
        forceDifferent,
        sourceFilter,
        showNoPlaceholderWarning: true,
        userInitiated: true
      });
      await refreshSuggestWidget({ repeat: 2 });
      await generationPromise;
      await refreshSuggestWidget({ hard: true, repeat: 2 });
    };

    subscriptions.push(
      vscode.commands.registerCommand("saurus.refreshSuggestions", async (uri?: string, line?: number, character?: number) => {
        await runRefreshWithOptionalDirection(undefined, uri, line, character);
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.refreshSuggestionsWithPrompt", async (uri?: string, line?: number, character?: number) => {
        const direction = await vscode.window.showInputBox({
          title: "Saurus: Generate With Prompt",
          prompt: "Enter a short direction for this AI generation run.",
          placeHolder: "Example: more lyrical, keep meaning intact",
          ignoreFocusOut: true
        });
        if (direction === undefined) {
          return;
        }

        const trimmedDirection = direction.trim();
        if (trimmedDirection.length === 0) {
          void vscode.window.showInformationMessage("Saurus: prompt direction cannot be empty.");
          return;
        }

        await runRefreshWithOptionalDirection(trimmedDirection, uri, line, character);
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.showAiOnlySuggestions", async (uri?: string, line?: number, character?: number) => {
        await runSourceFilteredGeneration("aiOnly", uri, line, character);
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.showThesaurusOnlySuggestions", async (uri?: string, line?: number, character?: number) => {
        await runSourceFilteredGeneration("thesaurusOnly", uri, line, character);
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.exitPlaceholderSuggestions", async (uri?: string, line?: number, character?: number) => {
        await this.exitPlaceholderSuggestions(uri, line, character);
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand(
        "saurus.applySuggestion",
        async (uri?: string, line?: number, character?: number, suggestion?: string) => {
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
          const settings = this.getSettings(document);
          if (!settings.enabled || !settings.languages.includes(document.languageId)) {
            return;
          }

          const match = findPlaceholderAtPosition(document, editor.selection.active, settings.delimiters);
          if (!match) {
            return;
          }
          const previousKey = this.buildSuggestionKeyData(document, match, settings).key;
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
          this.preferRefreshSelectionKeys.delete(previousKey);
        }
      )
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.reopenSuggestions", async (uri?: string, line?: number, character?: number) => {
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

        await refreshSuggestWidget({ hard: true, repeat: 1 });
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.clearPersistentCache", async () => {
        this.cache.clearAll();
        this.preferRefreshSelectionKeys.clear();
        this.sourceFilterByKey.clear();
        this.aiActionByKey.clear();
        if (this.persistSaveTimer) {
          clearTimeout(this.persistSaveTimer);
          this.persistSaveTimer = undefined;
        }

        try {
          await deletePersistedCache(this.persistentCachePath);
          this.notifyCompletionItemsChanged();
          void vscode.window.showInformationMessage("Saurus: persistent cache cleared.");
        } catch (error) {
          void vscode.window.showErrorMessage(`Saurus: failed to clear persistent cache. ${this.getErrorMessage(error)}`);
        }
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.disableAutoTriggerForWorkspace", async () => {
        await disableAutoTriggerForWorkspace();
        void vscode.window.showInformationMessage("Saurus: auto-trigger disabled for this workspace.");
      })
    );
  }

  private notifyCompletionItemsChanged(): void {
    this.completionItemsChangedEmitter.fire();
  }

  private async exitPlaceholderSuggestions(uri?: string, line?: number, character?: number): Promise<void> {
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
    const settings = this.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      await hideSuggestWidget();
      return;
    }

    const match = findPlaceholderAtPosition(document, editor.selection.active, settings.delimiters);
    if (!match) {
      await hideSuggestWidget();
      return;
    }

    const previousKey = this.buildSuggestionKeyData(document, match, settings).key;
    const didEdit = await editor.edit((editBuilder) => {
      editBuilder.replace(match.fullRange, match.rawInnerText);
    });
    if (didEdit) {
      const caret = new vscode.Position(
        match.fullRange.start.line,
        match.fullRange.start.character + match.rawInnerText.length
      );
      editor.selection = new vscode.Selection(caret, caret);
      this.preferRefreshSelectionKeys.delete(previousKey);
      this.sourceFilterByKey.delete(previousKey);
      this.aiActionByKey.delete(previousKey);
    }

    await hideSuggestWidget();
  }

  private async wrapSelectionInPlaceholder(editor: vscode.TextEditor, settings: SaurusSettings): Promise<boolean> {
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

  private hydratePersistentCache(): void {
    const settings = this.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    const ttlMs = settings.cachePersistTtlDays * DAY_MS;
    const persistedEntries = loadPersistedCache(this.persistentCachePath, ttlMs);
    if (persistedEntries.size === 0) {
      return;
    }

    this.cache.setEntries(persistedEntries);
    for (const [key, entry] of persistedEntries.entries()) {
      const thesaurusState = settings.thesaurusEnabled
        ? (entry.thesaurusOptions.length > 0 ? "ready" : "idle")
        : "idle";
      const aiState = entry.aiOptions.length > 0 ? "ready" : "idle";
      this.cache.setSourceState(key, "thesaurus", thesaurusState, entry.documentUri);
      this.cache.setSourceState(key, "ai", aiState, entry.documentUri);
    }

    this.notifyCompletionItemsChanged();
  }

  private schedulePersistentCacheSave(): void {
    const settings = this.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    if (this.persistSaveTimer) {
      clearTimeout(this.persistSaveTimer);
    }

    this.persistSaveTimer = setTimeout(() => {
      this.persistSaveTimer = undefined;
      void this.flushPersistentCache();
    }, PERSIST_SAVE_DEBOUNCE_MS);
  }

  private async flushPersistentCache(): Promise<void> {
    const settings = this.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    if (this.persistSaveInFlight) {
      this.persistSaveQueued = true;
      return;
    }

    this.persistSaveInFlight = true;
    try {
      const ttlMs = settings.cachePersistTtlDays * DAY_MS;
      const entries = pruneExpiredEntries(this.cache.listEntries(), ttlMs);
      await savePersistedCache(this.persistentCachePath, entries);
    } catch {
      // Best effort: persistence errors should not interrupt suggestions.
    } finally {
      this.persistSaveInFlight = false;
      if (this.persistSaveQueued) {
        this.persistSaveQueued = false;
        this.schedulePersistentCacheSave();
      }
    }
  }

  private async generateAiSuggestions(
    settings: SaurusSettings,
    document: vscode.TextDocument,
    prompt: string,
    userInitiated: boolean
  ): Promise<SuggestionResponse> {
    if (settings.aiProvider === "copilotChat") {
      return generateSuggestionsWithCopilotChat({
        model: settings.aiModel,
        timeoutMs: settings.aiTimeoutMs,
        prompt,
        justification: userInitiated
          ? "Saurus needs Copilot Chat to generate replacement suggestions for your placeholder."
          : undefined
      });
    }

    return generateSuggestionsWithAi({
      aiProvider: settings.aiProvider,
      aiPath: settings.aiPath,
      model: settings.aiModel,
      reasoningEffort: settings.aiReasoningEffort,
      timeoutMs: settings.aiTimeoutMs,
      workspaceDir: this.resolveWorkspaceDir(document),
      schemaPath: this.schemaPath,
      prompt
    });
  }

  private resolveWorkspaceDir(document: vscode.TextDocument): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }

    return path.dirname(document.fileName);
  }

  private async fetchThesaurusSuggestions(
    rawPlaceholder: string,
    settings: SaurusSettings
  ): Promise<ThesaurusLookupResult> {
    if (!settings.thesaurusEnabled) {
      return {
        suggestions: [],
        info: {
          provider: settings.thesaurusProvider,
          query: rawPlaceholder.trim(),
          entryCount: 0,
          suggestionCount: 0,
          definitions: [],
          stems: [],
          didYouMean: []
        }
      };
    }

    const lookupTerm = extractThesaurusLookupTerm(rawPlaceholder);
    if (lookupTerm.length === 0) {
      return {
        suggestions: [],
        info: {
          provider: settings.thesaurusProvider,
          query: lookupTerm,
          entryCount: 0,
          suggestionCount: 0,
          definitions: [],
          stems: [],
          didYouMean: []
        }
      };
    }

    const provider = createThesaurusProvider(settings.thesaurusProvider);
    return provider.lookup(lookupTerm, {
      apiKey: settings.thesaurusApiKey,
      timeoutMs: settings.thesaurusTimeoutMs,
      maxSuggestions: settings.thesaurusMaxSuggestions
    });
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
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
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

  private getErrorMessage(error: unknown): string {
    if (error instanceof ThesaurusConfigError || error instanceof ThesaurusRequestError) {
      return error.message;
    }

    if (error instanceof AiCliMissingError) {
      return error.message;
    }

    if (error instanceof AiAuthError) {
      return error.message;
    }

    if (error instanceof AiRequestError) {
      return error.message;
    }

    if (
      error instanceof CopilotChatUnavailableError ||
      error instanceof CopilotChatConsentRequiredError ||
      error instanceof CopilotChatBlockedError ||
      error instanceof CopilotChatRequestError
    ) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Unexpected error while generating suggestions.";
  }
}
