import { CLAUDE_PROVIDER_DEFINITION } from "./claudeProvider";
import { CODEX_PROVIDER_DEFINITION } from "./codexProvider";
import { COPILOT_CHAT_PROVIDER_DEFINITION } from "./copilotChatProvider";
import { COPILOT_CLI_PROVIDER_DEFINITION } from "./copilotCliProvider";
import type { AiProviderDefinition } from "./types";
export type {
  AiProviderBackgroundCheckOptions,
  AiProviderDefinition,
  AiProviderGenerateRequest,
  AiProviderModelDiscoveryOptions,
  AiProviderModelDiscoveryResult,
  AiProviderPreset,
  AiSuggestionProvider
} from "./types";
export {
  CLAUDE_PROVIDER_DEFINITION,
  CODEX_PROVIDER_DEFINITION,
  COPILOT_CHAT_PROVIDER_DEFINITION,
  COPILOT_CLI_PROVIDER_DEFINITION
};

const ALL_AI_PROVIDER_DEFINITIONS = [
  COPILOT_CHAT_PROVIDER_DEFINITION,
  COPILOT_CLI_PROVIDER_DEFINITION,
  CLAUDE_PROVIDER_DEFINITION,
  CODEX_PROVIDER_DEFINITION
] as const satisfies readonly AiProviderDefinition[];

type AnyAiProviderDefinition = (typeof ALL_AI_PROVIDER_DEFINITIONS)[number];

/** Union of configured AI provider kinds derived from the provider registry. */
export type AiProviderKind = AnyAiProviderDefinition["kind"];

type CliAiProviderDefinition = Extract<AnyAiProviderDefinition, { isCli: true }>;

/** Union of CLI-backed AI provider kinds derived from the provider registry. */
export type CliAiProviderKind = CliAiProviderDefinition["kind"];

function createProviderMap(): Map<AiProviderKind, AnyAiProviderDefinition> {
  const map = new Map<AiProviderKind, AnyAiProviderDefinition>();
  for (const definition of ALL_AI_PROVIDER_DEFINITIONS) {
    map.set(definition.kind, definition);
  }
  return map;
}

const AI_PROVIDER_DEFINITION_MAP = createProviderMap();
const DEFAULT_AI_PROVIDER_DEFINITION = ALL_AI_PROVIDER_DEFINITIONS.find(
  (definition) => "isDefault" in definition && definition.isDefault
) ?? ALL_AI_PROVIDER_DEFINITIONS[0];

/** Lists all AI provider definitions in UI display order. */
export function listAiProviderDefinitions(): readonly AnyAiProviderDefinition[] {
  return ALL_AI_PROVIDER_DEFINITIONS;
}

/** Returns the provider definition for a configured AI provider kind. */
export function getAiProviderDefinition(kind: AiProviderKind): AnyAiProviderDefinition {
  return AI_PROVIDER_DEFINITION_MAP.get(kind) ?? DEFAULT_AI_PROVIDER_DEFINITION;
}

/** Returns the default AI provider definition. */
export function getDefaultAiProviderDefinition(): AnyAiProviderDefinition {
  return DEFAULT_AI_PROVIDER_DEFINITION;
}

/** Returns the CLI provider definition for a CLI-backed AI provider kind. */
export function getCliAiProviderDefinition(kind: CliAiProviderKind): CliAiProviderDefinition {
  const definition = getAiProviderDefinition(kind);
  if (!definition.isCli) {
    throw new Error(`Provider is not CLI-backed: ${kind}`);
  }
  return definition as CliAiProviderDefinition;
}
