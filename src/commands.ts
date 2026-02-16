import * as path from "path";
import * as vscode from "vscode";
import { disableAutoTriggerForWorkspace, getSettings } from "./config";
import { extractContextFromDocument } from "./context";
import {
  CodexAuthError,
  CodexCliMissingError,
  CodexRequestError,
  generateSuggestionsWithCodex
} from "./codexClient";
import { hashText, renderPromptTemplate, toPromptVariables } from "./prompt";
import { findPlaceholderAtPosition } from "./placeholder";
import { addSuggestionsToSeen, dedupeSuggestions } from "./normalize";
import { SuggestionCache } from "./cache";
import {
  PlaceholderMatch,
  GenerationState,
  SaurusSettings,
  SuggestionCacheEntry,
  SuggestionRequest,
  SuggestionKeyData
} from "./types";

export interface CompletionLookup {
  key: string;
  match: PlaceholderMatch;
  entry?: SuggestionCacheEntry;
  state: GenerationState;
}

interface GenerateOptions {
  forceDifferent: boolean;
  showNoPlaceholderWarning?: boolean;
  quietErrors?: boolean;
}

async function refreshSuggestWidget(): Promise<void> {
  await vscode.commands.executeCommand("hideSuggestWidget");
  await new Promise<void>((resolve) => setTimeout(resolve, 16));
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
}

export class SaurusController {
  private readonly cache = new SuggestionCache();
  private readonly schemaPath: string;

  public constructor(private readonly extensionContext: vscode.ExtensionContext) {
    this.schemaPath = extensionContext.asAbsolutePath(path.join("resources", "suggestions.schema.json"));
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

    return {
      key: keyData.key,
      match,
      entry: this.cache.getEntry(keyData.key),
      state: this.cache.getState(keyData.key)
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
    this.cache.clearDocument(document.uri.toString());
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
        void vscode.window.showInformationMessage("Saurus: place the cursor inside a configured placeholder to generate suggestions.");
      }
      return;
    }

    const keyData = this.buildSuggestionKeyData(document, match, settings);
    const suggestionKey = keyData.key;
    const documentUri = document.uri.toString();
    const existingEntry = this.cache.getEntry(suggestionKey);

    if (!options.forceDifferent && existingEntry) {
      this.cache.setState(suggestionKey, "ready", documentUri);
      return;
    }

    const requestVersion = document.version;
    this.cache.setState(suggestionKey, "generating", documentUri);
    let newlyAddedOptionsCount = 0;

    try {
      await this.cache.runExclusive(suggestionKey, async () => {
        const seenNormalized = new Set<string>(existingEntry?.seenNormalized ?? []);
        const seenRaw = existingEntry ? [...existingEntry.seenRaw] : [];

        if (options.forceDifferent && existingEntry) {
          addSuggestionsToSeen(existingEntry.options, seenNormalized, seenRaw);
        }

        const request: SuggestionRequest = {
          placeholder: match.rawInnerText,
          contextBefore: keyData.contextBefore,
          contextAfter: keyData.contextAfter,
          suggestionCount: settings.suggestionCount,
          avoidSuggestions: seenRaw,
          fileName: path.basename(document.fileName),
          languageId: document.languageId
        };

        const prompt = renderPromptTemplate(settings.promptTemplate, toPromptVariables(request));

        const response = await generateSuggestionsWithCodex({
          codexPath: settings.codexPath,
          model: settings.codexModel,
          reasoningEffort: settings.codexReasoningEffort,
          timeoutMs: settings.codexTimeoutMs,
          workspaceDir: this.resolveWorkspaceDir(document),
          schemaPath: this.schemaPath,
          prompt
        });

        if (document.version !== requestVersion) {
          this.cache.setState(suggestionKey, "idle", documentUri);
          return;
        }

        const nextOptions = dedupeSuggestions(response.suggestions, seenNormalized, settings.suggestionCount);
        newlyAddedOptionsCount = nextOptions.length;
        addSuggestionsToSeen(nextOptions, seenNormalized, seenRaw);

        const combinedOptions = options.forceDifferent && existingEntry
          ? [...existingEntry.options, ...nextOptions]
          : nextOptions;

        const nextEntry: SuggestionCacheEntry = {
          options: combinedOptions,
          seenNormalized,
          seenRaw,
          createdAt: Date.now(),
          documentVersion: requestVersion,
          documentUri
        };

        this.cache.setEntry(suggestionKey, nextEntry);
        this.cache.setState(suggestionKey, "ready", documentUri);
      });
    } catch (error) {
      this.handleGenerationError(error, existingEntry, suggestionKey, documentUri, options.quietErrors);
      return;
    }

    if (options.forceDifferent) {
      if (newlyAddedOptionsCount === 0) {
        void vscode.window.showInformationMessage("Saurus: no novel options found for this placeholder. Try refreshing again or adjust the prompt.");
      }
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
        showNoPlaceholderWarning: true
      });
      await refreshSuggestWidget();
      return;
    }

    if (selection.start.line !== selection.end.line) {
      void vscode.window.showInformationMessage(
        "Saurus: selection suggestions currently support single-line selections. Select a shorter span."
      );
      return;
    }

    const selectedText = document.getText(selection);
    if (selectedText.trim().length === 0) {
      void vscode.window.showInformationMessage("Saurus: selected text is empty.");
      return;
    }

    const placeholderText = `${settings.delimiters.open}${selectedText}${settings.delimiters.close}`;
    const replacementRange = new vscode.Range(selection.start, selection.end);
    const didEdit = await editor.edit((editBuilder) => {
      editBuilder.replace(replacementRange, placeholderText);
    });

    if (!didEdit) {
      return;
    }

    const cursor = new vscode.Position(
      replacementRange.start.line,
      replacementRange.start.character + settings.delimiters.open.length
    );
    editor.selection = new vscode.Selection(cursor, cursor);

    await this.generateForEditor(editor, {
      forceDifferent: false,
      showNoPlaceholderWarning: false
    });
    await refreshSuggestWidget();
  }

  public registerCommands(subscriptions: vscode.Disposable[]): void {
    subscriptions.push(
      vscode.commands.registerCommand("saurus.generateSuggestions", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        await this.generateForEditor(editor, {
          forceDifferent: false,
          showNoPlaceholderWarning: true
        });

        await refreshSuggestWidget();
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
      vscode.commands.registerCommand("saurus.refreshSuggestions", async (uri?: string, line?: number, character?: number) => {
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

        await this.generateForEditor(editor, {
          forceDifferent: true,
          showNoPlaceholderWarning: true
        });

        await refreshSuggestWidget();
      })
    );

    subscriptions.push(
      vscode.commands.registerCommand("saurus.disableAutoTriggerForWorkspace", async () => {
        await disableAutoTriggerForWorkspace();
        void vscode.window.showInformationMessage("Saurus: auto-trigger disabled for this workspace.");
      })
    );
  }

  private resolveWorkspaceDir(document: vscode.TextDocument): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }

    return path.dirname(document.fileName);
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
      promptTemplateHash
    });

    return {
      key: `${document.uri.toString()}::${hashText(payload)}`,
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
      promptTemplateHash
    };
  }

  private handleGenerationError(
    error: unknown,
    existingEntry: SuggestionCacheEntry | undefined,
    key: string,
    documentUri: string,
    quietErrors = false
  ): void {
    if (existingEntry) {
      this.cache.setEntry(key, existingEntry);
      this.cache.setState(key, "ready", documentUri);
      if (!quietErrors) {
        void vscode.window.showErrorMessage(`Saurus: ${this.getErrorMessage(error)} Showing previous cached options.`);
      }
      return;
    }

    this.cache.deleteEntry(key);
    this.cache.setState(key, "error", documentUri);

    if (!quietErrors) {
      void vscode.window.showErrorMessage(`Saurus: ${this.getErrorMessage(error)}`);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof CodexCliMissingError) {
      return "Codex CLI was not found. Install Codex CLI or set saurus.codex.path.";
    }

    if (error instanceof CodexAuthError) {
      return "Codex CLI is not logged in. Run `codex login` and retry.";
    }

    if (error instanceof CodexRequestError) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Unexpected error while generating suggestions.";
  }
}
