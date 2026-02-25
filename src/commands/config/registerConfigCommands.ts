import * as vscode from "vscode";
import { configureAiModelCommand } from "./internal/configureAiModel";
import { configureAiProviderCommand } from "./internal/configureAiProvider";
import { configureThesaurusProviderCommand } from "./internal/configureThesaurusProvider";

/** Registers Saurus configuration commands. */
export function registerConfigCommands(subscriptions: vscode.Disposable[]): void {
  subscriptions.push(
    vscode.commands.registerCommand("saurus.configureThesaurusProvider", async () => {
      await configureThesaurusProviderCommand(vscode.window.activeTextEditor?.document);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.configureAiProvider", async () => {
      await configureAiProviderCommand(vscode.window.activeTextEditor?.document);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.configureAiModel", async () => {
      await configureAiModelCommand(vscode.window.activeTextEditor?.document);
    })
  );
}
