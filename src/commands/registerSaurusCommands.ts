import * as vscode from "vscode";
import { SaurusController } from "../app";

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

async function promptForDirection(value?: string): Promise<string | undefined> {
  const direction = await vscode.window.showInputBox({
    title: "Saurus: Generate With Prompt",
    prompt: "Enter a short direction for this AI generation run.",
    placeHolder: "Example: more lyrical, keep meaning intact",
    value,
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

async function reopenQuickFix(): Promise<void> {
  await vscode.commands.executeCommand("editor.action.quickFix");
}

async function showQuickFixDuringGeneration(generationPromise: Promise<void>): Promise<void> {
  await reopenQuickFix();
  await generationPromise;
  await reopenQuickFix();
}

/** Registers Saurus editor commands and hotkey handlers. */
export function registerSaurusCommands(
  controller: SaurusController,
  subscriptions: vscode.Disposable[]
): void {
  const runRefreshWithOptionalDirection = async (
    forceDifferent: boolean,
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
      forceDifferent,
      promptDirection,
      showNoPlaceholderWarning: true,
      userInitiated: true
    });
    await showQuickFixDuringGeneration(generationPromise);
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
      await showQuickFixDuringGeneration(generationPromise);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.suggestForSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const settings = controller.getSettings(editor.document);
      if (!settings.enabled || !settings.languages.includes(editor.document.languageId)) {
        return;
      }

      if (editor.selection.isEmpty) {
        const generationPromise = controller.generateForEditor(editor, {
          forceDifferent: false,
          showNoPlaceholderWarning: true,
          userInitiated: true
        });
        await showQuickFixDuringGeneration(generationPromise);
        return;
      }

      const wrapped = await controller.wrapSelectionInPlaceholder(editor, settings);
      if (!wrapped) {
        return;
      }

      const generationPromise = controller.generateForEditor(editor, {
        forceDifferent: false,
        showNoPlaceholderWarning: false,
        userInitiated: true
      });
      await showQuickFixDuringGeneration(generationPromise);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.suggestForSelectionWithPrompt", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const initialSelection = new vscode.Selection(editor.selection.start, editor.selection.end);
      const settings = controller.getSettings(editor.document);
      if (!settings.enabled || !settings.languages.includes(editor.document.languageId)) {
        return;
      }

      const promptDirection = await promptForDirection();
      if (promptDirection === undefined) {
        return;
      }

      if (initialSelection.isEmpty) {
        const updated = await controller.setPlaceholderPrompt(editor, settings, promptDirection);
        if (!updated) {
          return;
        }
        await runRefreshWithOptionalDirection(true, undefined);
        return;
      }

      editor.selection = new vscode.Selection(initialSelection.start, initialSelection.end);
      const wrapped = await controller.wrapSelectionInPlaceholderWithPrompt(editor, settings, promptDirection);
      if (!wrapped) {
        return;
      }

      const generationPromise = controller.generateForEditor(editor, {
        forceDifferent: true,
        showNoPlaceholderWarning: false,
        userInitiated: true
      });
      await showQuickFixDuringGeneration(generationPromise);
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
      await runRefreshWithOptionalDirection(true, undefined, uri, line, character);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.refreshSuggestionsWithPrompt", async (uri?: string, line?: number, character?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      moveSelectionToCommandTarget(editor, uri, line, character);
      const settings = controller.getSettings(editor.document);
      const initialPrompt = controller.getPlaceholderPromptAtPosition(editor.document, editor.selection.active);
      const promptDirection = await promptForDirection(initialPrompt);
      if (promptDirection === undefined) {
        return;
      }

      const updated = await controller.setPlaceholderPrompt(editor, settings, promptDirection);
      if (!updated) {
        return;
      }

      await runRefreshWithOptionalDirection(true, undefined, uri, line, character);
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
    vscode.commands.registerCommand("saurus.reopenQuickFix", async (uri?: string, line?: number, character?: number) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      moveSelectionToCommandTarget(editor, uri, line, character);
      await reopenQuickFix();
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.clearPersistentCache", async () => {
      await controller.clearPersistentCache();
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.removeAllPlaceholderDelimiters", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      await controller.removeAllPlaceholderDelimiters(editor);
    })
  );

}
