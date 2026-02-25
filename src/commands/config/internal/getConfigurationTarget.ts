import * as vscode from "vscode";

/** Chooses the VS Code settings target for Saurus configuration updates. */
export function getConfigurationTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
