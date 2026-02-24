export {
  CLAUDE_CLI_FALLBACK_MODELS,
  CODEX_CLI_FALLBACK_MODELS,
  COPILOT_CLI_FALLBACK_MODELS,
  AiModelDiscoveryError,
  discoverCliModels,
  getCliModelDiscoveryCommand,
  parseCodexModelsCache,
  parseModelChoicesFromHelp
} from "./aiModelDiscovery";
export type { CliModelDiscoveryCommand, ModelDiscoveryResult } from "./aiModelDiscovery";

export {
  DEFAULT_AI_PROVIDER,
  getAiProviderLabel,
  getDefaultAiPath,
  isCliAiProvider,
  listAiProviderPresets,
  sanitizeAiProvider
} from "./aiProviderCatalog";
export type { AiProviderPreset } from "./aiProviderCatalog";

export {
  AiAuthError,
  AiCliMissingError,
  AiRequestError,
  buildAiEnvOverrides,
  buildAiExecArgs,
  buildAiLoginStatusArgs,
  generateSuggestionsWithAi
} from "./cliAiClient";
export type { AiExecOptions, AiRequestOptions } from "./cliAiClient";

export {
  canUseCopilotChatInBackground,
  generateSuggestionsWithCopilotChat
} from "./copilotChatClient";
export type { CopilotChatRequestOptions } from "./copilotChatClient";

export {
  CopilotChatBlockedError,
  CopilotChatConsentRequiredError,
  CopilotChatRequestError,
  CopilotChatUnavailableError,
  buildCopilotChatSelectors,
  mapCopilotChatError,
  selectFirstCopilotModel
} from "./copilotChatCore";
export type { CopilotChatSelector } from "./copilotChatCore";
