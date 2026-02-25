import * as vscode from "vscode";
import { listAiProviderPresets } from "../../../services/ai";
import { getConfigurationTarget } from "./getConfigurationTarget";

/** Prompts the user to configure the active AI provider. */
export async function configureAiProviderCommand(document?: vscode.TextDocument): Promise<void> {
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
