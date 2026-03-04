import * as path from "path";
import * as vscode from "vscode";
import {
  addSuggestionsToSeen,
  appendDirectionGuidance,
  dedupeSuggestions,
  extractThesaurusLookupTerm,
  renderPromptTemplate,
  toPromptVariables
} from "../../../core/suggestions";
import {
  AiAuthError,
  AiCliMissingError,
  AiRequestError,
  CopilotChatBlockedError,
  CopilotChatConsentRequiredError,
  CopilotChatRequestError,
  CopilotChatUnavailableError,
  createAiSuggestionProvider
} from "../../../services/ai";
import {
  createThesaurusProvider,
  ThesaurusConfigError,
  ThesaurusLookupResult,
  ThesaurusRequestError
} from "../../../services/thesaurus";
import {
  getStoredThesaurusApiKey,
  migrateLegacyThesaurusApiKeyToSecretStorage
} from "../../../config";
import { findPlaceholderAtPosition } from "../../../core/placeholder";
import { SuggestionCache } from "../../../state";
import {
  PlaceholderMatch,
  SaurusSettings,
  SuggestionCacheEntry,
  SuggestionKeyData,
  SuggestionResponse,
  SuggestionRequest,
  SuggestionSourceFilter,
  ThesaurusLookupInfo
} from "../../../types";
import { triggerSuggestWidget } from "../../../ui/suggest";

/** Options for generating suggestions in the active editor. */
export type GenerateForEditorOptions = {
  forceDifferent: boolean;
  sourceFilter?: SuggestionSourceFilter;
  promptDirection?: string;
  showNoPlaceholderWarning?: boolean;
  quietErrors?: boolean;
  userInitiated?: boolean;
};

/** Represents a cached thesaurus result keyed by semantic lookup context. */
export type ThesaurusSemanticCacheEntry = {
  options: string[];
  info?: ThesaurusLookupInfo;
};

/** Represents a cached AI suggestion result keyed by semantic request context. */
export type AiSemanticCacheEntry = {
  options: string[];
  lastPrompt?: string;
  lastModel?: string;
};

type SuggestionGenerationServiceDeps = {
  extensionContext: vscode.ExtensionContext;
  schemaPath: string;
  cache: SuggestionCache;
  thesaurusSemanticCache: Map<string, ThesaurusSemanticCacheEntry>;
  aiSemanticCache: Map<string, AiSemanticCacheEntry>;
  sourceFilterByKey: Map<string, SuggestionSourceFilter>;
  aiActionByKey: Map<string, "refresh" | "refreshWithPrompt">;
  getSettings: (document?: vscode.TextDocument) => SaurusSettings;
  buildSuggestionKeyData: (
    document: vscode.TextDocument,
    match: PlaceholderMatch,
    settings: SaurusSettings
  ) => SuggestionKeyData;
  hydrateUiEntryFromSemanticCaches: (
    suggestionKey: string,
    keyData: SuggestionKeyData,
    document: vscode.TextDocument,
    existingEntry?: SuggestionCacheEntry
  ) => SuggestionCacheEntry | undefined;
  updateSourceStatesForEntry: (
    key: string,
    entry: SuggestionCacheEntry,
    settings: SaurusSettings,
    documentUri: string
  ) => void;
  mapActivationModeToSourceFilter: (mode: SaurusSettings["activationModeOnEnter"]) => SuggestionSourceFilter;
  schedulePersistentCacheSave: () => void;
  notifyCompletionItemsChanged: () => void;
};

/** Runs thesaurus and AI suggestion generation for the active placeholder. */
export class SuggestionGenerationService {
  public constructor(private readonly deps: SuggestionGenerationServiceDeps) {}

  public async generateForEditor(editor: vscode.TextEditor, options: GenerateForEditorOptions): Promise<void> {
    const document = editor.document;
    const settings = this.deps.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return;
    }

    const match = findPlaceholderAtPosition(document, editor.selection.active, settings.delimiters);
    if (!match) {
      if (options.showNoPlaceholderWarning) {
        void vscode.window.showInformationMessage(
          "Saurus: place the cursor inside a configured placeholder to generate suggestions."
        );
      }
      return;
    }

    const keyData = this.deps.buildSuggestionKeyData(document, match, settings);
    const suggestionKey = keyData.key;
    const documentUri = document.uri.toString();
    let existingEntry = this.deps.hydrateUiEntryFromSemanticCaches(
      suggestionKey,
      keyData,
      document,
      this.deps.cache.getEntry(suggestionKey)
    );
    const hasCachedThesaurus = this.deps.thesaurusSemanticCache.has(keyData.thesaurusCacheKey);
    const hasCachedAi = this.deps.aiSemanticCache.has(keyData.aiCacheKey);
    const sourceFilter = options.sourceFilter
      ?? this.deps.sourceFilterByKey.get(suggestionKey)
      ?? this.deps.mapActivationModeToSourceFilter(settings.activationModeOnEnter);
    this.deps.sourceFilterByKey.set(suggestionKey, sourceFilter);

    const isUserInitiated = options.userInitiated ?? true;
    const shouldRunAi = sourceFilter !== "thesaurusOnly" && (
      options.forceDifferent ||
      settings.aiAutoRun ||
      isUserInitiated
    );
    const shouldRunThesaurus = sourceFilter !== "aiOnly" && settings.thesaurusEnabled;
    let aiAllowedForThisRun = true;
    if (shouldRunAi && !isUserInitiated) {
      const aiProvider = createAiSuggestionProvider(settings.aiProvider);
      aiAllowedForThisRun = await aiProvider.canGenerateInBackground({
        extensionContext: this.deps.extensionContext,
        model: settings.aiModel
      });
    }
    const needsThesaurus = shouldRunThesaurus && !hasCachedThesaurus;
    const needsAi = aiAllowedForThisRun && shouldRunAi && (options.forceDifferent || !hasCachedAi);

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
        this.deps.cache.setEntry(suggestionKey, cachedEntry);
        this.deps.updateSourceStatesForEntry(suggestionKey, cachedEntry, settings, documentUri);
        this.deps.schedulePersistentCacheSave();
      }
      return;
    }

    if (needsAi && options.forceDifferent) {
      this.deps.aiActionByKey.set(
        suggestionKey,
        options.promptDirection?.trim() ? "refreshWithPrompt" : "refresh"
      );
    } else {
      this.deps.aiActionByKey.delete(suggestionKey);
    }

    if (needsThesaurus) {
      this.deps.cache.setSourceState(suggestionKey, "thesaurus", "generating", documentUri);
    }
    if (needsAi) {
      this.deps.cache.setSourceState(suggestionKey, "ai", "generating", documentUri);
    }
    if (needsThesaurus || needsAi) {
      this.deps.notifyCompletionItemsChanged();
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
      await this.deps.cache.runExclusive(suggestionKey, async () => {
        const entryAtStart = this.deps.hydrateUiEntryFromSemanticCaches(
          suggestionKey,
          keyData,
          document,
          this.deps.cache.getEntry(suggestionKey) ?? existingEntry
        ) ?? existingEntry;
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
              this.deps.cache.setSourceState(suggestionKey, "thesaurus", "idle", documentUri);
              this.deps.cache.setSourceState(suggestionKey, "ai", "idle", documentUri);
              this.deps.notifyCompletionItemsChanged();
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
            this.deps.thesaurusSemanticCache.set(keyData.thesaurusCacheKey, {
              options: [...deduped],
              info: thesaurusInfo
            });
            this.deps.cache.setEntry(suggestionKey, buildCurrentEntry());
            this.setSourceSettledStateAndRefreshPopover(suggestionKey, "thesaurus", "ready", documentUri);
          } catch (error) {
            this.setSourceSettledStateAndRefreshPopover(suggestionKey, "thesaurus", "error", documentUri);
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
              this.deps.cache.setSourceState(suggestionKey, "thesaurus", "idle", documentUri);
              this.deps.cache.setSourceState(suggestionKey, "ai", "idle", documentUri);
              this.deps.notifyCompletionItemsChanged();
              return;
            }

            const nextOptions = dedupeSuggestions(response.suggestions, seenNormalized, settings.suggestionCount);
            newlyAddedAiOptions = nextOptions.length;
            aiLastAddedCount = nextOptions.length;
            addSuggestionsToSeen(nextOptions, seenNormalized, seenRaw);

            aiOptions = [...aiOptions, ...nextOptions];
            aiLoadedCount = aiOptions.length;
            aiLastResponseCached = false;
            this.deps.aiSemanticCache.set(keyData.aiCacheKey, {
              options: [...aiOptions],
              lastPrompt: lastAiPrompt,
              lastModel: lastAiModel
            });
            this.deps.cache.setEntry(suggestionKey, buildCurrentEntry());
            this.setSourceSettledStateAndRefreshPopover(suggestionKey, "ai", "ready", documentUri);
          } catch (error) {
            aiFailed = true;
            aiLastAddedCount = 0;
            aiLoadedCount = aiOptions.length;
            aiLastResponseCached = true;
            this.deps.cache.setEntry(suggestionKey, buildCurrentEntry());
            this.setSourceSettledStateAndRefreshPopover(
              suggestionKey,
              "ai",
              aiOptions.length > 0 ? "ready" : "error",
              documentUri
            );

            if (!options.quietErrors) {
              void vscode.window.showErrorMessage(`Saurus AI: ${this.getErrorMessage(error)}`);
            }
          }
        }

        if (document.version !== requestVersion) {
          this.deps.cache.setSourceState(suggestionKey, "thesaurus", "idle", documentUri);
          this.deps.cache.setSourceState(suggestionKey, "ai", "idle", documentUri);
          this.deps.notifyCompletionItemsChanged();
          return;
        }

        const nextEntry = buildCurrentEntry();
        this.deps.cache.setEntry(suggestionKey, nextEntry);
        this.deps.updateSourceStatesForEntry(suggestionKey, nextEntry, settings, documentUri);
        this.deps.schedulePersistentCacheSave();
      });
    } finally {
      if (needsAi) {
        this.deps.aiActionByKey.delete(suggestionKey);
        this.deps.notifyCompletionItemsChanged();
      }
      loadingMessage.dispose();
    }

    if (options.forceDifferent && aiAttempted && !aiFailed && newlyAddedAiOptions === 0) {
      void vscode.window.setStatusBarMessage("Saurus: no novel AI options found for this placeholder.", 3000);
    }
  }

  private setSourceSettledStateAndRefreshPopover(
    key: string,
    source: "thesaurus" | "ai",
    state: "ready" | "error",
    documentUri: string
  ): void {
    this.deps.cache.setSourceState(key, source, state, documentUri);
    this.deps.notifyCompletionItemsChanged();
    void triggerSuggestWidget();
  }

  private async generateAiSuggestions(
    settings: SaurusSettings,
    document: vscode.TextDocument,
    prompt: string,
    userInitiated: boolean
  ): Promise<SuggestionResponse> {
    const aiProvider = createAiSuggestionProvider(settings.aiProvider);
    return aiProvider.generate({
      prompt,
      timeoutMs: settings.aiTimeoutMs,
      model: settings.aiModel,
      reasoningEffort: settings.aiReasoningEffort,
      aiPath: settings.aiPath,
      workspaceDir: this.resolveWorkspaceDir(document),
      schemaPath: this.deps.schemaPath,
      userInitiated
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
    let apiKey = await getStoredThesaurusApiKey(this.deps.extensionContext.secrets);
    if (apiKey.length === 0) {
      await migrateLegacyThesaurusApiKeyToSecretStorage(this.deps.extensionContext);
      apiKey = await getStoredThesaurusApiKey(this.deps.extensionContext.secrets);
    }

    return provider.lookup(lookupTerm, {
      apiKey,
      timeoutMs: settings.thesaurusTimeoutMs,
      maxSuggestions: settings.thesaurusMaxSuggestions
    });
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
