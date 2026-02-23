import * as vscode from "vscode";
import { discoverCliModels } from "./aiModelDiscovery";
import { getAiProviderLabel, isCliAiProvider, listAiProviderPresets } from "./aiProvider";
import { getSettings } from "./config";
import { CliAiProviderKind } from "./types";

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

interface ModelQuickPickItem extends vscode.QuickPickItem {
  value: string | undefined;
  action: "select" | "manual";
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

async function discoverCopilotChatModels(): Promise<string[]> {
  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  return uniqueSorted(models.map((model) => model.id));
}

async function promptForCustomModel(currentModel?: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: "Saurus: AI Model",
    prompt: "Enter a provider-specific model id, or leave empty to use the provider default.",
    placeHolder: "Example: gpt-5.1-codex",
    value: currentModel ?? "",
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return undefined;
  }

  return value.trim();
}

async function configureAiModel(document?: vscode.TextDocument): Promise<void> {
  const settings = getSettings(document);
  const cfg = vscode.workspace.getConfiguration("saurus", document);
  const providerLabel = getAiProviderLabel(settings.aiProvider);
  const currentModel = settings.aiModel?.trim();
  const previousRawModelSetting = cfg.get<string>("ai.model", "");

  let discoveredModels: string[] = [];
  let discoveryDetail = "";
  let discoveryWarning: string | undefined;

  try {
    if (settings.aiProvider === "copilotChat") {
      discoveredModels = await discoverCopilotChatModels();
      discoveryDetail = "Discovered from VS Code Copilot Chat models";
    } else if (isCliAiProvider(settings.aiProvider)) {
      const { models, sourceLabel, warningMessage } = await discoverCliModels(
        settings.aiProvider as CliAiProviderKind,
        settings.aiPath
      );
      discoveredModels = models;
      discoveryDetail = `Discovered from ${sourceLabel}`;
      discoveryWarning = warningMessage;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model discovery error.";
    discoveryWarning = `Saurus: ${message}`;
  }

  const items: ModelQuickPickItem[] = [
    {
      label: "Provider default",
      description: currentModel ? `Current override: ${currentModel}` : "Current setting",
      detail: "Clears saurus.ai.model so the provider chooses the model",
      value: undefined,
      action: "select"
    }
  ];

  const sortedDiscovered = uniqueSorted(discoveredModels);
  for (const model of sortedDiscovered) {
    items.push({
      label: model,
      description: currentModel === model ? "Current" : undefined,
      detail: discoveryDetail || `Available in ${providerLabel}`,
      value: model,
      action: "select"
    });
  }

  if (currentModel && !sortedDiscovered.includes(currentModel)) {
    items.push({
      label: currentModel,
      description: "Current custom value",
      detail: "Configured in saurus.ai.model (not returned by provider model discovery)",
      value: currentModel,
      action: "select"
    });
  }

  items.push({
    label: "Enter custom model…",
    detail: `Set saurus.ai.model manually for ${providerLabel}`,
    value: undefined,
    action: "manual"
  });

  const selection = await vscode.window.showQuickPick(items, {
    title: "Saurus: Configure AI Model",
    placeHolder: `Choose a model for ${providerLabel}`,
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!selection) {
    return;
  }

  if (discoveryWarning) {
    void vscode.window.showWarningMessage(discoveryWarning);
  }

  let nextModel = selection.value;
  if (selection.action === "manual") {
    const custom = await promptForCustomModel(currentModel);
    if (custom === undefined) {
      return;
    }
    nextModel = custom.length > 0 ? custom : undefined;
  }

  try {
    await cfg.update("ai.model", nextModel ?? "", getConfigurationTarget());
  } catch (error) {
    try {
      await cfg.update("ai.model", previousRawModelSetting, getConfigurationTarget());
    } catch {
      // If rollback also fails, the original error is still the actionable one.
    }

    const message = error instanceof Error ? error.message : "Unknown settings update error.";
    void vscode.window.showErrorMessage(
      `Saurus: failed to set AI model for ${providerLabel}. Kept previous setting. ${message}`
    );
    return;
  }

  if (nextModel && nextModel.trim().length > 0) {
    void vscode.window.showInformationMessage(`Saurus: AI model set to ${nextModel} (${providerLabel}).`);
  } else {
    void vscode.window.showInformationMessage(`Saurus: AI model reset to provider default (${providerLabel}).`);
  }
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

  subscriptions.push(
    vscode.commands.registerCommand("saurus.configureAiModel", async () => {
      await configureAiModel(vscode.window.activeTextEditor?.document);
    })
  );
}
