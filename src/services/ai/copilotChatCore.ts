/** Describes a copilot chat selector. */
/** Describes a copilot chat selector. */
export type CopilotChatSelector = {
    vendor: "copilot";
    id?: string;
    family?: string;
};

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}

/** Represents a copilot chat unavailable error. */
export class CopilotChatUnavailableError extends Error {
  public constructor(message = "No Copilot Chat models are available in VS Code. Sign in to GitHub Copilot Chat or choose a CLI provider in saurus.ai.provider.") {
    super(message);
    this.name = "CopilotChatUnavailableError";
  }
}

/** Represents a copilot chat consent required error. */
export class CopilotChatConsentRequiredError extends Error {
  public constructor(message = "Copilot Chat access has not been granted for Saurus yet. Run a Saurus AI command once to approve access, or switch providers.") {
    super(message);
    this.name = "CopilotChatConsentRequiredError";
  }
}

/** Represents a copilot chat blocked error. */
export class CopilotChatBlockedError extends Error {
  public constructor(message = "Copilot Chat request is currently blocked (quota, policy, or entitlement). Check Copilot access or switch providers.") {
    super(message);
    this.name = "CopilotChatBlockedError";
  }
}

/** Represents a copilot chat request error. */
export class CopilotChatRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CopilotChatRequestError";
  }
}

/** Builds copilot chat selectors. */
export function buildCopilotChatSelectors(modelHint?: string): CopilotChatSelector[] {
  const selectors: CopilotChatSelector[] = [];
  const trimmed = modelHint?.trim();

  if (trimmed) {
    selectors.push({ vendor: "copilot", id: trimmed });
    selectors.push({ vendor: "copilot", family: trimmed });
  }

  selectors.push({ vendor: "copilot" });
  return selectors;
}

/** Selects first copilot model. */
export async function selectFirstCopilotModel<T>(
  modelHint: string | undefined,
  queryModels: (selector: CopilotChatSelector) => PromiseLike<T[]>
): Promise<T | undefined> {
  const selectors = buildCopilotChatSelectors(modelHint);
  for (const selector of selectors) {
    const models = await queryModels(selector);
    if (models.length > 0) {
      return models[0];
    }
  }

  return undefined;
}

/** Maps copilot chat error. */
export function mapCopilotChatError(error: unknown): Error {
  if (
    error instanceof CopilotChatUnavailableError ||
    error instanceof CopilotChatConsentRequiredError ||
    error instanceof CopilotChatBlockedError ||
    error instanceof CopilotChatRequestError
  ) {
    return error;
  }

  const code = getErrorCode(error);
  if (code === "NoPermissions") {
    return new CopilotChatConsentRequiredError();
  }
  if (code === "Blocked") {
    return new CopilotChatBlockedError();
  }
  if (code === "NotFound") {
    return new CopilotChatUnavailableError();
  }

  if (error instanceof Error) {
    return new CopilotChatRequestError(`Copilot Chat request failed: ${error.message}`);
  }

  return new CopilotChatRequestError("Copilot Chat request failed.");
}
