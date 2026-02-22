import * as vscode from "vscode";
import { listAiProviderPresets } from "./aiProvider";

function getConfigurationTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

async function configureThesaurusProvider(document?: vscode.TextDocument): Promise<"configured" | "disabled" | "cancelled"> {
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

  const existingKey = cfg.get<string>("thesaurus.apiKey", "").trim();
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
  await cfg.update("thesaurus.apiKey", trimmedKey, target);
  void vscode.window.showInformationMessage("Saurus: Merriam-Webster API key saved.");
  return "configured";
}

async function configureAiProvider(document?: vscode.TextDocument): Promise<void> {
  const presets = listAiProviderPresets();
  const cfg = vscode.workspace.getConfiguration("saurus", document);
  const selection = await vscode.window.showQuickPick<{ providerKind: string; label: string; detail: string }>(
    presets.map((preset) => {
      const pathLabel = preset.defaultPath.length > 0 ? preset.defaultPath : "(ignored)";
      return {
        providerKind: preset.kind,
        label: preset.quickPickLabel,
        detail: `provider=${preset.kind}  path=${pathLabel}`
      };
    }),
    {
      title: "Saurus: Configure AI Provider",
      placeHolder: "Choose the AI provider Saurus should use"
    }
  );

  if (!selection) {
    return;
  }

  const preset = presets.find((candidate) => candidate.kind === selection.providerKind);
  if (!preset) {
    return;
  }

  const target = getConfigurationTarget();
  await cfg.update("ai.provider", preset.kind, target);
  await cfg.update("ai.path", preset.defaultPath, target);
  await cfg.update("ai.model", "", target);

  const providerLabel = preset.quickPickLabel.replace(" (default)", "");
  const pathLabel = preset.defaultPath.length > 0 ? preset.defaultPath : "(ignored)";
  void vscode.window.showInformationMessage(
    `Saurus: configured ${providerLabel} (path: ${pathLabel}, model: provider default).`
  );
}

export function registerConfigCommands(subscriptions: vscode.Disposable[]): void {
  subscriptions.push(
    vscode.commands.registerCommand("saurus.configureThesaurusProvider", async () => {
      await configureThesaurusProvider(vscode.window.activeTextEditor?.document);
    })
  );

  subscriptions.push(
    vscode.commands.registerCommand("saurus.configureAiProvider", async () => {
      await configureAiProvider(vscode.window.activeTextEditor?.document);
    })
  );
}
