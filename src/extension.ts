import * as path from "path";
import * as vscode from "vscode";
import { SaurusController } from "./app";
import { ProblemFinderService } from "./app/saurus/internal/ProblemFinderService";
import { PersistentCacheCoordinator } from "./app/saurus/internal/PersistentCacheCoordinator";
import { PlaceholderEditActions } from "./app/saurus/internal/PlaceholderEditActions";
import { SuggestionGenerationService } from "./app/saurus/internal/SuggestionGenerationService";
import { registerSaurusCommands } from "./commands";
import { registerConfigCommands } from "./commands/config";
import { migrateLegacyThesaurusApiKeyToSecretStorage } from "./config";
import { findPlaceholderAtPosition } from "./core/placeholder";
import { SaurusCompletionProvider } from "./ui/completion";
import { PlaceholderHighlighter } from "./ui/highlight";
import { triggerSuggestWidget } from "./ui/suggest";

const PERSISTED_CACHE_FILENAME = "saurus-cache-v1.json";

/** Activates the Saurus extension and wires VS Code integrations. */
export function activate(context: vscode.ExtensionContext): void {
  void migrateLegacyThesaurusApiKeyToSecretStorage(context).catch(() => undefined);

  const schemaPath = context.asAbsolutePath(path.join("resources", "suggestions.schema.json"));
  const problemFinderSchemaPath = context.asAbsolutePath(path.join("resources", "problem-finder.schema.json"));
  const persistentCachePath = path.join(context.globalStorageUri.fsPath, PERSISTED_CACHE_FILENAME);
  const controller = new SaurusController({
    extensionContext: context,
    schemaPath,
    problemFinderSchemaPath,
    persistentCachePath,
    factories: {
      createProblemFinderService: (deps) => new ProblemFinderService(deps),
      createPersistentCacheCoordinator: (deps) => new PersistentCacheCoordinator(deps),
      createPlaceholderEditActions: (deps) => new PlaceholderEditActions(deps),
      createSuggestionGenerationService: (deps) => new SuggestionGenerationService(deps)
    }
  });
  controller.initialize();

  const provider = new SaurusCompletionProvider(controller);
  const highlighter = new PlaceholderHighlighter(controller);
  context.subscriptions.push(controller);

  const selector: vscode.DocumentSelector = [
    { scheme: "file" },
    { scheme: "untitled" }
  ];

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, provider));
  context.subscriptions.push(highlighter);
  registerSaurusCommands(controller, context.subscriptions);
  registerConfigCommands(context, context.subscriptions);

  const lastSuggestionKeyByDocument = new Map<string, string | undefined>();
  const autoTriggerTimers = new Map<string, NodeJS.Timeout>();

  function clearTimer(documentUri: string): void {
    const timer = autoTriggerTimers.get(documentUri);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    autoTriggerTimers.delete(documentUri);
  }

  async function runAutoTrigger(
    editor: vscode.TextEditor,
    expectedKey: string,
    documentUri: string
  ): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.uri.toString() !== documentUri) {
      return;
    }

    const activeKey = controller.getSuggestionKeyAtPosition(activeEditor.document, activeEditor.selection.active);
    if (!activeKey || activeKey !== expectedKey) {
      return;
    }

    const generationPromise = controller.generateForEditor(activeEditor, {
      forceDifferent: false,
      quietErrors: true,
      userInitiated: false
    });

    await triggerSuggestWidget();
    await generationPromise;
    await triggerSuggestWidget();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const documentUri = event.document.uri.toString();
      controller.applyProblemDocumentChanges(event.document, event.contentChanges);
      controller.invalidateDocument(event.document);
      highlighter.scheduleForDocument(event.document, 40);
      lastSuggestionKeyByDocument.delete(documentUri);
      clearTimer(documentUri);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const documentUri = document.uri.toString();
      controller.clearProblemsForDocument(document);
      highlighter.clearForDocument(document);
      lastSuggestionKeyByDocument.delete(documentUri);
      clearTimer(documentUri);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        return;
      }
      controller.refreshProblemDecorationsForEditor(editor);
      highlighter.schedule(editor);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      controller.refreshProblemDecorationsForVisibleEditors();
      highlighter.refreshVisibleEditors();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("saurus")) {
        return;
      }

      controller.refreshProblemDecorationsForVisibleEditors();
      highlighter.refreshVisibleEditors();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.selections.length !== 1) {
        return;
      }

      const selection = event.selections[0];
      const document = event.textEditor.document;
      const documentUri = document.uri.toString();
      const currentKey = controller.getSuggestionKeyAtPosition(document, selection.active);

      // VS Code auto-closing behavior can leave the placeholder inner text selected
      // after typing the opening delimiter around a selection (e.g. typing "{{").
      // If Saurus opens on that non-empty selection, command-only rows (Generate more,
      // etc.) may replace the selected inner text with "" before their command runs.
      // Collapse only this exact "selection equals placeholder inner range" case and
      // let the follow-up selection event continue the normal Saurus auto-open flow.
      if (currentKey && !selection.isEmpty) {
        const settings = controller.getSettings(document);
        const match = findPlaceholderAtPosition(document, selection.active, settings.delimiters);
        if (
          match &&
          selection.start.isEqual(match.innerRange.start) &&
          selection.end.isEqual(match.innerRange.end)
        ) {
          event.textEditor.selection = new vscode.Selection(selection.active, selection.active);
          return;
        }
      }

      const previousKey = lastSuggestionKeyByDocument.get(documentUri);
      lastSuggestionKeyByDocument.set(documentUri, currentKey);

      if (!currentKey) {
        clearTimer(documentUri);
        return;
      }

      if (previousKey === currentKey) {
        return;
      }

      const activationSourceFilter = controller.getActivationSourceFilter(document);
      controller.setSourceFilterForKey(currentKey, activationSourceFilter);

      if (!controller.shouldAutoTrigger(document)) {
        return;
      }

      if (controller.hasCachedEntry(currentKey)) {
        void triggerSuggestWidget();
        return;
      }

      clearTimer(documentUri);
      const debounceMs = controller.getAutoDebounceMs(document);
      const timer = setTimeout(() => {
        void runAutoTrigger(event.textEditor, currentKey, documentUri);
      }, debounceMs);
      autoTriggerTimers.set(documentUri, timer);
    })
  );

  highlighter.refreshVisibleEditors();
}

/** Runs extension shutdown cleanup when VS Code unloads Saurus. */
export function deactivate(): void {
  // Nothing to dispose here; VS Code handles subscription disposal.
}
