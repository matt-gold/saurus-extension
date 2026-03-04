import * as vscode from "vscode";
import {
  getStoredThesaurusApiKey,
  storeThesaurusApiKey
} from "../../../config";
import { getConfigurationTarget } from "./getConfigurationTarget";

/** Prompts the user to configure the active thesaurus provider. */
export async function configureThesaurusProviderCommand(
  secrets: vscode.SecretStorage,
  document?: vscode.TextDocument
): Promise<"configured" | "disabled" | "cancelled"> {
  const cfg = vscode.workspace.getConfiguration("saurus", document);
  const selection = await vscode.window.showQuickPick<{ id: "enterKey" | "disable"; label: string; description: string }>(
    [
      {
        id: "enterKey",
        label: "Enter Merriam-Webster API Key",
        description: "Enable thesaurus lookups with Merriam-Webster"
      },
      {
        id: "disable",
        label: "Disable Thesaurus",
        description: "Turn off thesaurus suggestions for now"
      }
    ],
    {
      title: "Saurus: Configure Thesaurus Provider",
      placeHolder: "Thesaurus requires a Merriam-Webster API key"
    }
  );

  if (!selection) {
    return "cancelled";
  }

  const target = getConfigurationTarget();
  if (selection.id === "disable") {
    await cfg.update("thesaurus.enabled", false, target);
    void vscode.window.showInformationMessage("Saurus: thesaurus suggestions disabled.");
    return "disabled";
  }

  const existingKey = await getStoredThesaurusApiKey(secrets);
  const apiKey = await vscode.window.showInputBox({
    title: "Saurus: Merriam-Webster API Key",
    prompt: "Enter your Merriam-Webster thesaurus API key.",
    placeHolder: "Merriam-Webster API key",
    ignoreFocusOut: true,
    password: true,
    value: existingKey
  });

  if (apiKey === undefined) {
    return "cancelled";
  }

  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    void vscode.window.showInformationMessage("Saurus: API key cannot be empty.");
    return "cancelled";
  }

  await cfg.update("thesaurus.provider", "merriamWebster", target);
  await cfg.update("thesaurus.enabled", true, target);
  await storeThesaurusApiKey(secrets, trimmedKey);
  void vscode.window.showInformationMessage("Saurus: Merriam-Webster API key saved in secure storage.");
  return "configured";
}
