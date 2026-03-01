import * as vscode from "vscode";
import { SaurusController } from "../app";
import { disableAutoTriggerForWorkspace } from "../config";
import { SuggestionSourceFilter } from "../types";
import {
  refreshSuggestWidget,
  refreshSuggestWidgetStable
} from "../ui/suggest";

function moveSelectionToCommandTarget(
  editor: vscode.TextEditor,
  uri?: string,
  line?: number,
  character?: number
): void {
  if (
    typeof uri === "string" &&
    typeof line === "number" &&
    typeof character === "number" &&
    editor.document.uri.toString() === uri
  ) {
    const target = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(target, target);
  }
}

async function promptForDirection(): Promise<string | undefined> {
  const direction = await vscode.window.showInputBox({
    title: "Saurus: Generate With Prompt",
    prompt: "Enter a short direction for this AI generation run.",
    placeHolder: "Example: more lyrical, keep meaning intact",
    ignoreFocusOut: true
  });
  if (direction === undefined) {
    return undefined;
  }

  const trimmed = direction.trim();
  if (trimmed.length === 0) {
    void vscode.window.showInformationMessage("Saurus: prompt direction cannot be empty.");
    return undefined;
  }

  return trimmed;
}

/** Registers Saurus editor commands and hotkey handlers. */
export function registerSaurusCommands(
  controller: SaurusController,
  subscriptions: vscode.Disposable[]
): void {
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

    moveSelectionToCommandTarget(editor, uri, line, character);

    const generationPromise = controller.generateForEditor(editor, {
      forceDifferent: true,
      promptDirection,
      showNoPlaceholderWarning: true,
      userInitiated: true
    });
    const key = controller.getSuggestionKeyAtPosition(editor.document, editor.selection.active);
    if (key) {
      controller.setPreferRefreshSelectionForKey(key, true);
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

    moveSelectionToCommandTarget(editor, uri, line, character);

    const settings = controller.getSettings(editor.document);
    if (!settings.enabled || !settings.languages.includes(editor.document.languageId)) {
      return;
    }

    if (!editor.selection.isEmpty) {
      const wrapped = await controller.wrapSelectionInPlaceholder(editor, settings);
      if (!wrapped) {
        return;
      }
    }

    const lookup = controller.getCompletionLookup(editor.document, editor.selection.active);
    if (!lookup) {
      void vscode.window.showInformationMessage(
        "Saurus: place the cursor inside a configured placeholder to use source-specific suggestions."
      );
      return;
    }

    controller.setSourceFilterForKey(lookup.key, sourceFilter);
    controller.setPreferRefreshSelectionForKey(lookup.key, sourceFilter === "aiOnly");

    const forceDifferent = sourceFilter === "aiOnly"
      ? lookup.entry?.aiOptions.length === 0
      : false;

    const generationPromise = controller.generateForEditor(editor, {
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
    vscode.commands.registerCommand("saurus.generateSuggestions", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const generationPromise = controller.generateForEditor(editor, {
        forceDifferent: false,
        showNoPlaceholderWarning: true,
        userInitiated: true
      });
      const key = controller.getSuggestionKeyAtPosition(editor.document, editor.selection.active);
      if (key) {
        controller.setPreferRefreshSelectionForKey(key, false);
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

      await controller.suggestForSelection(editor);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.suggestForSelectionWithPrompt", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const initialSelection = new vscode.Selection(editor.selection.start, editor.selection.end);
      const promptDirection = await promptForDirection();
      if (promptDirection === undefined) {
        return;
      }

      const settings = controller.getSettings(editor.document);
      if (!settings.enabled || !settings.languages.includes(editor.document.languageId)) {
        return;
      }

      if (initialSelection.isEmpty) {
        await runRefreshWithOptionalDirection(promptDirection);
        return;
      }

      editor.selection = new vscode.Selection(initialSelection.start, initialSelection.end);
      const wrapped = await controller.wrapSelectionInPlaceholder(editor, settings);
      if (!wrapped) {
        return;
      }

      const key = controller.getSuggestionKeyAtPosition(editor.document, editor.selection.active);
      if (key) {
        controller.setPreferRefreshSelectionForKey(key, true);
      }

      const generationPromise = controller.generateForEditor(editor, {
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

  subscriptions.push(
    vscode.commands.registerCommand("saurus.findProblems", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      await controller.findProblems(editor);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.ignoreProblem", async (uriString?: string, problemId?: string) => {
      controller.ignoreProblem(uriString, problemId);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.fixProblem", async (uriString?: string, problemId?: string) => {
      controller.fixProblem(uriString, problemId);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.convertProblemToStegoComment", async (uriString?: string, problemId?: string) => {
      await controller.convertProblemToStegoComment(uriString, problemId);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.refreshSuggestions", async (uri?: string, line?: number, character?: number) => {
      await runRefreshWithOptionalDirection(undefined, uri, line, character);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.refreshSuggestionsWithPrompt", async (uri?: string, line?: number, character?: number) => {
      const promptDirection = await promptForDirection();
      if (promptDirection === undefined) {
        return;
      }

      await runRefreshWithOptionalDirection(promptDirection, uri, line, character);
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
      await controller.exitPlaceholderSuggestions(uri, line, character);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand(
      "saurus.applySuggestion",
      async (uri?: string, line?: number, character?: number, suggestion?: string) => {
        await controller.applySuggestion(uri, line, character, suggestion);
      }
    )
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.reopenSuggestions", async (uri?: string, line?: number, character?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      moveSelectionToCommandTarget(editor, uri, line, character);
      await refreshSuggestWidget({ hard: true, repeat: 1 });
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.clearPersistentCache", async () => {
      await controller.clearPersistentCache();
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.disableAutoTriggerForWorkspace", async () => {
      await disableAutoTriggerForWorkspace();
      void vscode.window.showInformationMessage("Saurus: auto-trigger disabled for this workspace.");
    })
  );
}
