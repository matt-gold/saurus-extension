import * as vscode from "vscode";
import { SaurusController } from "./commands";
import { SaurusCompletionProvider } from "./provider";
import { PlaceholderHighlighter } from "./highlight";

export function activate(context: vscode.ExtensionContext): void {
  const controller = new SaurusController(context);
  const provider = new SaurusCompletionProvider(controller);
  const highlighter = new PlaceholderHighlighter(controller);
  context.subscriptions.push(controller);

  const selector: vscode.DocumentSelector = [
    { scheme: "file" },
    { scheme: "untitled" }
  ];

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, provider));
  context.subscriptions.push(highlighter);
  controller.registerCommands(context.subscriptions);

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

  async function triggerSuggest(): Promise<void> {
    await vscode.commands.executeCommand("editor.action.triggerSuggest");
  }

  async function refreshSuggestWidget(): Promise<void> {
    await vscode.commands.executeCommand("hideSuggestWidget");
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    await triggerSuggest();
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
      quietErrors: true
    });

    await triggerSuggest();
    await generationPromise;
    await refreshSuggestWidget();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const documentUri = event.document.uri.toString();
      controller.invalidateDocument(event.document);
      highlighter.scheduleForDocument(event.document, 40);
      lastSuggestionKeyByDocument.delete(documentUri);
      clearTimer(documentUri);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const documentUri = document.uri.toString();
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
      highlighter.schedule(editor);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      highlighter.refreshVisibleEditors();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("saurus")) {
        return;
      }

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
        void refreshSuggestWidget();
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

export function deactivate(): void {
  // Nothing to dispose here; VS Code handles subscription disposal.
}
