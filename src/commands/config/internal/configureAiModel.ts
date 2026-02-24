import * as vscode from "vscode";
import { getSettings } from "../../../config";
import { discoverCliModels, getAiProviderLabel, isCliAiProvider } from "../../../services/ai";
import { CliAiProviderKind } from "../../../types";
import { getConfigurationTarget } from "./getConfigurationTarget";

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

/** Prompts the user to configure the AI model for the current provider. */
export async function configureAiModelCommand(document?: vscode.TextDocument): Promise<void> {
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
