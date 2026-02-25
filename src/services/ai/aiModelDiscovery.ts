import { AiProviderKind, CliAiProviderKind } from "../../types";
import { getAiProviderDefinition, getCliAiProviderDefinition } from "./providers";
import {
  AiProviderModelDiscoveryResult,
  AiProviderModelDiscoveryOptions
} from "./providers/types";
import {
  AiModelDiscoveryError,
  CliModelDiscoveryCommand,
  parseCodexModelsCache,
  parseModelChoicesFromHelp
} from "./modelDiscoveryShared";

/** Result returned by provider model discovery. */
export type ModelDiscoveryResult = AiProviderModelDiscoveryResult;

/** Runs model discovery for any configured AI provider. */
export async function discoverAiProviderModels(
  provider: AiProviderKind,
  options: AiProviderModelDiscoveryOptions
): Promise<ModelDiscoveryResult> {
  return getAiProviderDefinition(provider).discoverModels(options);
}

/** Runs model discovery for a CLI-backed AI provider. */
export async function discoverCliModels(
  provider: CliAiProviderKind,
  aiPath: string,
  timeoutMs = 10000
): Promise<ModelDiscoveryResult> {
  return getCliAiProviderDefinition(provider).discoverModels({ aiPath, timeoutMs });
}

/** Returns the CLI model-discovery command for a CLI-backed provider. */
export function getCliModelDiscoveryCommand(provider: CliAiProviderKind, aiPath: string): CliModelDiscoveryCommand {
  const definition = getCliAiProviderDefinition(provider);
  const command = definition.getCliModelDiscoveryCommand?.(aiPath);
  if (!command) {
    throw new AiModelDiscoveryError(`Provider does not expose a CLI model discovery command: ${provider}`);
  }
  return command;
}

export { AiModelDiscoveryError, parseCodexModelsCache, parseModelChoicesFromHelp };
export type { CliModelDiscoveryCommand };
