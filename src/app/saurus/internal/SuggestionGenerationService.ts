import * as path from "path";
import * as vscode from "vscode";
import { addSuggestionsToSeen, dedupeSuggestions } from "../../../core/suggestions";
import {
  AiAuthError,
  AiCliMissingError,
  AiRequestError,
  CopilotChatBlockedError,
  CopilotChatConsentRequiredError,
  CopilotChatRequestError,
  CopilotChatUnavailableError,
  createSuggestionProvider
} from "../../../services/ai";
import {
  SaurusSettings,
  SuggestionResponse
} from "../../../types";
import { PlaceholderSessionFactory } from "./session";
import {
  SuggestionBuildRequestOptions,
  SuggestionRequestBuilder
} from "./request";
import {
  SuggestionResultStore,
  SuggestionSemanticCacheEntry
} from "./store";

/** Options for generating suggestions in the active editor. */
export type GenerateForEditorOptions = {
  forceDifferent: boolean;
  promptDirection?: string;
  showNoPlaceholderWarning?: boolean;
  quietErrors?: boolean;
  userInitiated?: boolean;
};

type SuggestionGenerationServiceDeps = {
  extensionContext: vscode.ExtensionContext;
  schemaPath: string;
  getSettings: (document?: vscode.TextDocument) => SaurusSettings;
  sessionFactory: PlaceholderSessionFactory;
  requestBuilder: SuggestionRequestBuilder;
  resultStore: SuggestionResultStore;
  getRefreshMode: (key: string) => "refresh" | "refreshWithPrompt" | undefined;
  setRefreshMode: (key: string, mode?: "refresh" | "refreshWithPrompt") => void;
};

/** Runs suggestion generation for the active placeholder session. */
export class SuggestionGenerationService {
  public constructor(private readonly deps: SuggestionGenerationServiceDeps) {}

  public async generateForEditor(editor: vscode.TextEditor, options: GenerateForEditorOptions): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Saurus: Generating suggestions..."
      },
      async () => {
        const document = editor.document;
        const settings = this.deps.getSettings(document);
        if (!settings.enabled || !settings.languages.includes(document.languageId)) {
          return;
        }

        const session = this.deps.sessionFactory.getSession(document, editor.selection.active);
        if (!session) {
          if (options.showNoPlaceholderWarning) {
            void vscode.window.showInformationMessage(
              "Saurus: place the cursor inside a configured placeholder to generate suggestions."
            );
          }
          return;
        }

        const isUserInitiated = options.userInitiated ?? true;
        const shouldRunSuggestions = options.forceDifferent || isUserInitiated;
        let providerAllowedForThisRun = true;
        if (shouldRunSuggestions && !isUserInitiated) {
          const provider = createSuggestionProvider(settings.aiProvider);
          providerAllowedForThisRun = await provider.canGenerateInBackground({
            extensionContext: this.deps.extensionContext,
            model: settings.aiModel
          });
        }

        const hasCachedSuggestions = this.deps.resultStore.getSemanticResult(session.semanticKey) !== undefined;
        const needsSuggestions =
          providerAllowedForThisRun && shouldRunSuggestions && (options.forceDifferent || !hasCachedSuggestions);

        if (!needsSuggestions) {
          if (session.entry) {
            const cachedEntry = {
              ...session.entry,
              loadedCount: session.entry.suggestions.length,
              lastAddedCount: 0,
              lastResponseCached: true,
              lastAccessedAt: Date.now()
            };
            this.deps.resultStore.updateEntry(session.key, cachedEntry);
            this.deps.resultStore.markReady(session.key, cachedEntry, session.documentUri);
          }
          return;
        }

        if (options.forceDifferent) {
          this.deps.setRefreshMode(
            session.key,
            options.promptDirection?.trim() ? "refreshWithPrompt" : "refresh"
          );
        } else {
          this.deps.setRefreshMode(session.key);
        }

        this.deps.resultStore.markGenerating(session.key, session.documentUri);

        let newlyAddedSuggestions = 0;
        let suggestionAttempted = false;
        let suggestionFailed = false;

        try {
          await this.deps.resultStore.runExclusive(session.key, async () => {
            const currentSession = this.deps.sessionFactory.getSession(document, editor.selection.active) ?? session;
            const currentEntry = currentSession.entry ?? this.deps.resultStore.createEntry(document);
            const builtRequest = this.deps.requestBuilder.buildForDocument(
              currentSession,
              settings,
              {
                fileName: path.basename(document.fileName),
                languageId: document.languageId
              },
              {
                forceDifferent: options.forceDifferent,
                promptDirection: options.promptDirection,
                userInitiated: isUserInitiated
              }
            );

            suggestionAttempted = true;

            try {
              const response = await this.generateSuggestions(
                settings,
                document,
                builtRequest.renderedPrompt,
                isUserInitiated
              );

              if (document.version !== session.documentVersion) {
                this.deps.resultStore.markIdle(session.key, session.documentUri);
                return;
              }

              const seenNormalized = new Set(currentEntry.seenNormalized);
              const seenRaw = [...currentEntry.seenRaw];
              const nextOptions = dedupeSuggestions(response.suggestions, seenNormalized, settings.suggestionCount);
              newlyAddedSuggestions = nextOptions.length;
              addSuggestionsToSeen(nextOptions, seenNormalized, seenRaw);
              const suggestions = [...currentEntry.suggestions, ...nextOptions];
              const nextEntry = {
                ...currentEntry,
                suggestions,
                lastPrompt: builtRequest.renderedPrompt,
                lastModel: settings.aiModel?.trim().length ? settings.aiModel.trim() : undefined,
                loadedCount: suggestions.length,
                lastAddedCount: nextOptions.length,
                lastResponseCached: false,
                seenNormalized,
                seenRaw,
                documentVersion: session.documentVersion,
                lastAccessedAt: Date.now()
              };
              const semanticEntry: SuggestionSemanticCacheEntry = {
                options: [...suggestions],
                lastPrompt: nextEntry.lastPrompt,
                lastModel: nextEntry.lastModel
              };
              this.deps.resultStore.setSemanticResult(session.semanticKey, semanticEntry);
              this.deps.resultStore.markReady(session.key, nextEntry, session.documentUri);
            } catch (error) {
              suggestionFailed = true;
              const failedEntry = {
                ...currentEntry,
                loadedCount: currentEntry.suggestions.length,
                lastAddedCount: 0,
                lastResponseCached: true,
                lastAccessedAt: Date.now()
              };
              this.deps.resultStore.markError(session.key, failedEntry, session.documentUri);

              if (!options.quietErrors) {
                void vscode.window.showErrorMessage(`Saurus AI: ${this.getErrorMessage(error)}`);
              }
            }
          });
        } catch (error) {
          if (!options.quietErrors) {
            void vscode.window.showErrorMessage(`Saurus AI: ${this.getErrorMessage(error)}`);
          }
        } finally {
          this.deps.setRefreshMode(session.key);
        }

        if (options.forceDifferent && suggestionAttempted && !suggestionFailed && newlyAddedSuggestions === 0) {
          void vscode.window.setStatusBarMessage("Saurus: no novel AI options found for this placeholder.", 3000);
        }
      }
    );
  }

  private async generateSuggestions(
    settings: SaurusSettings,
    document: vscode.TextDocument,
    prompt: string,
    userInitiated: boolean
  ): Promise<SuggestionResponse> {
    const provider = createSuggestionProvider(settings.aiProvider);
    return provider.generate({
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

  private getErrorMessage(error: unknown): string {
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
