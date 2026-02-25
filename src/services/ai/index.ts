export {
  createAiSuggestionProvider
} from "./aiSuggestionProvider";
export type {
  AiProviderBackgroundCheckOptions,
  AiProviderGenerateRequest,
  AiSuggestionProvider
} from "./aiSuggestionProvider";

export {
  AiModelDiscoveryError,
  discoverAiProviderModels,
  discoverCliModels,
  getCliModelDiscoveryCommand,
  parseCodexModelsCache,
  parseModelChoicesFromHelp
} from "./aiModelDiscovery";
export type { CliModelDiscoveryCommand, ModelDiscoveryResult } from "./aiModelDiscovery";

export {
  CLAUDE_PROVIDER_DEFINITION,
  CODEX_PROVIDER_DEFINITION,
  COPILOT_CHAT_PROVIDER_DEFINITION,
  COPILOT_CLI_PROVIDER_DEFINITION
} from "./providers";
export type {
  AiProviderDefinition,
  AiProviderModelDiscoveryOptions,
  AiProviderModelDiscoveryResult
} from "./providers";

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
