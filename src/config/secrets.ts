import * as vscode from "vscode";

const MERRIAM_WEBSTER_API_KEY_SECRET_KEY = "saurus.thesaurus.merriamWebster.apiKey";

function normalizeSecretValue(value: string | undefined): string {
  return value?.trim() ?? "";
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
