import * as path from "path";
import * as vscode from "vscode";
import { SaurusController } from "./app";
import { ProblemFinderService } from "./app/saurus/internal/ProblemFinderService";
import { PlaceholderEditActions } from "./app/saurus/internal/PlaceholderEditActions";
import { SuggestionRequestBuilder } from "./app/saurus/internal/request";
import { PlaceholderSessionFactory } from "./app/saurus/internal/session";
import { SuggestionResultStore } from "./app/saurus/internal/store";
import { SuggestionGenerationService } from "./app/saurus/internal/SuggestionGenerationService";
import { registerSaurusCommands } from "./commands";
import { registerConfigCommands } from "./commands/config";
import { PlaceholderCodeLensProvider } from "./ui/codelens";
import { SaurusCodeActionProvider } from "./ui/codeActions";
import { PlaceholderHighlighter } from "./ui/highlight";

const PERSISTED_CACHE_FILENAME = "saurus-cache-v1.json";

/** Activates the Saurus extension and wires VS Code integrations. */
export function activate(context: vscode.ExtensionContext): void {
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
      createPlaceholderEditActions: (deps) => new PlaceholderEditActions(deps),
      createPlaceholderSessionFactory: (deps) => new PlaceholderSessionFactory(deps),
      createSuggestionRequestBuilder: () => new SuggestionRequestBuilder(),
      createSuggestionResultStore: (deps) => new SuggestionResultStore(deps),
      createSuggestionGenerationService: (deps) => new SuggestionGenerationService(deps)
    }
  });
  controller.initialize();

  const provider = new SaurusCodeActionProvider(controller);
  const codeLensProvider = new PlaceholderCodeLensProvider(controller);
  const highlighter = new PlaceholderHighlighter(controller);
  context.subscriptions.push(controller);

  const selector: vscode.DocumentSelector = [
    { scheme: "file" },
    { scheme: "untitled" }
  ];

  async function openQuickFixForPlaceholderEntry(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    if (event.selections.length !== 1 || !event.kind || event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
      return;
    }

    const selection = event.selections[0];
    if (!selection.isEmpty) {
      return;
    }

    const document = event.textEditor.document;
    const currentKey = controller.getSuggestionKeyAtPosition(document, selection.active);
    if (!currentKey) {
      return;
    }

    await controller.reopenQuickFix();
  }

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, provider, {
      providedCodeActionKinds: SaurusCodeActionProvider.providedCodeActionKinds
    })
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );
  context.subscriptions.push(highlighter);
  registerSaurusCommands(controller, context.subscriptions);
  registerConfigCommands(context, context.subscriptions);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      controller.applyProblemDocumentChanges(event.document, event.contentChanges);
      controller.invalidateDocument(event.document);
      highlighter.scheduleForDocument(event.document, 40);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      controller.clearProblemsForDocument(document);
      highlighter.clearForDocument(document);
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
      void openQuickFixForPlaceholderEntry(event);
    })
  );

  highlighter.refreshVisibleEditors();
}

/** Runs extension shutdown cleanup when VS Code unloads Saurus. */
export function deactivate(): void {
  // Nothing to dispose here; VS Code handles subscription disposal.
}
