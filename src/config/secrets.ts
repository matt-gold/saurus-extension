import * as vscode from "vscode";

const LEGACY_THESAURUS_API_KEY_SETTING = "thesaurus.apiKey";
const MERRIAM_WEBSTER_API_KEY_SECRET_KEY = "saurus.thesaurus.merriamWebster.apiKey";

function normalizeSecretValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

type LegacyApiKeyLocation = {
  config: vscode.WorkspaceConfiguration;
  target: vscode.ConfigurationTarget;
  value: string;
};

function collectLegacyApiKeyLocations(): LegacyApiKeyLocation[] {
  const locations: LegacyApiKeyLocation[] = [];
  const rootConfig = vscode.workspace.getConfiguration("saurus");
  const rootInspect = rootConfig.inspect<string>(LEGACY_THESAURUS_API_KEY_SETTING);

  const globalValue = normalizeSecretValue(rootInspect?.globalValue);
  if (globalValue.length > 0) {
    locations.push({
      config: rootConfig,
      target: vscode.ConfigurationTarget.Global,
      value: globalValue
    });
  }

  const workspaceValue = normalizeSecretValue(rootInspect?.workspaceValue);
  if (workspaceValue.length > 0) {
    locations.push({
      config: rootConfig,
      target: vscode.ConfigurationTarget.Workspace,
      value: workspaceValue
    });
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const folderConfig = vscode.workspace.getConfiguration("saurus", folder.uri);
    const folderInspect = folderConfig.inspect<string>(LEGACY_THESAURUS_API_KEY_SETTING);
    const workspaceFolderValue = normalizeSecretValue(folderInspect?.workspaceFolderValue);
    if (workspaceFolderValue.length === 0) {
      continue;
    }

    locations.push({
      config: folderConfig,
      target: vscode.ConfigurationTarget.WorkspaceFolder,
      value: workspaceFolderValue
    });
  }

  return locations;
}

/** Loads the Merriam-Webster API key from VS Code Secret Storage. */
export async function getStoredThesaurusApiKey(secrets: vscode.SecretStorage): Promise<string> {
  const key = await secrets.get(MERRIAM_WEBSTER_API_KEY_SECRET_KEY);
  return normalizeSecretValue(key);
}

/** Stores the Merriam-Webster API key in VS Code Secret Storage. */
export async function storeThesaurusApiKey(
  secrets: vscode.SecretStorage,
  apiKey: string
): Promise<void> {
  await secrets.store(MERRIAM_WEBSTER_API_KEY_SECRET_KEY, apiKey.trim());
}

/** Clears any legacy thesaurus API key values found in settings.json scopes. */
export async function clearLegacyThesaurusApiKeySettings(): Promise<void> {
  const locations = collectLegacyApiKeyLocations();
  for (const location of locations) {
    await location.config.update(LEGACY_THESAURUS_API_KEY_SETTING, undefined, location.target);
  }
}

/** Migrates a legacy settings-stored thesaurus API key to Secret Storage. */
export async function migrateLegacyThesaurusApiKeyToSecretStorage(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const locations = collectLegacyApiKeyLocations();
  if (locations.length === 0) {
    return false;
  }

  const existingSecret = await getStoredThesaurusApiKey(context.secrets);
  if (existingSecret.length === 0) {
    await storeThesaurusApiKey(context.secrets, locations[0].value);
  }

  await clearLegacyThesaurusApiKeySettings();
  return true;
}
