import * as vscode from "vscode";
import { SaurusController, SuggestionStateChangeEvent } from "./commands";
import { SaurusActionCodeLensProvider } from "./actionCodeLens";
import { PlaceholderHighlighter } from "./highlight";
import { SaurusSuggestionQuickPick } from "./suggestionQuickPick";

export function activate(context: vscode.ExtensionContext): void {
  const controller = new SaurusController(context);
  const codeLensProvider = new SaurusActionCodeLensProvider(controller);
  const highlighter = new PlaceholderHighlighter(controller);
  const suggestionQuickPick = new SaurusSuggestionQuickPick(controller);
  context.subscriptions.push(controller);
  context.subscriptions.push(codeLensProvider);
  context.subscriptions.push(highlighter);
  context.subscriptions.push(suggestionQuickPick);
  controller.registerCommands(context.subscriptions, suggestionQuickPick);

  const selector: vscode.DocumentSelector = [
    { scheme: "file" },
    { scheme: "untitled" }
  ];

  context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, codeLensProvider));

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

  function scheduleHighlighterRefreshForEvent(event?: SuggestionStateChangeEvent): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }

    if (event?.documentUri && event.documentUri !== activeEditor.document.uri.toString()) {
      return;
    }

    highlighter.schedule(activeEditor);
  }

  function updatePlaceholderContext(editor?: vscode.TextEditor): void {
    const inPlaceholder = Boolean(
      editor && controller.getSuggestionKeyAtPosition(editor.document, editor.selection.active)
    );
    void vscode.commands.executeCommand("setContext", "saurus.inPlaceholder", inPlaceholder);
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

    await suggestionQuickPick.openForEditor(activeEditor);
    await controller.generateForEditor(activeEditor, {
      forceDifferent: false,
      quietErrors: true,
      userInitiated: false
    });
    await suggestionQuickPick.openForEditor(activeEditor);
  }

  context.subscriptions.push(
    controller.onDidChangeSuggestionState((event) => {
      scheduleHighlighterRefreshForEvent(event);
      suggestionQuickPick.syncWithActiveEditor(vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const documentUri = event.document.uri.toString();
      controller.invalidateDocument(event.document);
      highlighter.scheduleForDocument(event.document, 40);
      lastSuggestionKeyByDocument.delete(documentUri);
      clearTimer(documentUri);
      suggestionQuickPick.syncWithActiveEditor(vscode.window.activeTextEditor);
      updatePlaceholderContext(vscode.window.activeTextEditor);
      codeLensProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const documentUri = document.uri.toString();
      highlighter.clearForDocument(document);
      lastSuggestionKeyByDocument.delete(documentUri);
      clearTimer(documentUri);
      suggestionQuickPick.syncWithActiveEditor(vscode.window.activeTextEditor);
      updatePlaceholderContext(vscode.window.activeTextEditor);
      codeLensProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      suggestionQuickPick.syncWithActiveEditor(editor);
      updatePlaceholderContext(editor);
      codeLensProvider.refresh();
      if (!editor) {
        return;
      }
      highlighter.schedule(editor);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      highlighter.refreshVisibleEditors();
      suggestionQuickPick.syncWithActiveEditor(vscode.window.activeTextEditor);
      codeLensProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("saurus")) {
        return;
      }

      highlighter.refreshVisibleEditors();
      suggestionQuickPick.syncWithActiveEditor(vscode.window.activeTextEditor);
      codeLensProvider.refresh();
      updatePlaceholderContext(vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.selections.length !== 1) {
        updatePlaceholderContext(undefined);
        codeLensProvider.refresh();
        return;
      }

      const selection = event.selections[0];
      const document = event.textEditor.document;
      const documentUri = document.uri.toString();
      const currentKey = controller.getSuggestionKeyAtPosition(document, selection.active);
      const previousKey = lastSuggestionKeyByDocument.get(documentUri);

      updatePlaceholderContext(event.textEditor);
      codeLensProvider.refresh();
      highlighter.schedule(event.textEditor);
      suggestionQuickPick.syncWithActiveEditor(event.textEditor);

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
        void suggestionQuickPick.openForEditor(event.textEditor);
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

  updatePlaceholderContext(vscode.window.activeTextEditor);
  highlighter.refreshVisibleEditors();
  codeLensProvider.refresh();
}

export function deactivate(): void {
  // Nothing to dispose here; VS Code handles subscription disposal.
}
