import * as path from "path";
import { COPILOT_CLI_PROVIDER } from "../internal/cliProviders/CopilotCliProvider";
import {
  AiModelDiscoveryError,
  CliModelDiscoveryCommand,
  parseModelChoicesFromHelp,
  runCliModelDiscoveryCommand
} from "../modelDiscoveryShared";
import { createCliAiRuntime } from "./internal/createCliAiRuntime";
import type { AiProviderDefinition } from "./types";

function isGhWrapperCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "gh" || base === "gh.exe";
}

/** Built-in fallback model list for the Copilot CLI provider. */
export const COPILOT_CLI_PROVIDER_FALLBACK_MODELS: readonly string[] = [
  "claude-sonnet-4.6",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "claude-opus-4.6",
  "claude-opus-4.6-fast",
  "claude-opus-4.5",
  "claude-sonnet-4",
  "gemini-3-pro-preview",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1",
  "gpt-5.1-codex-mini",
  "gpt-5-mini",
  "gpt-4.1"
] as const;

/** Builds the Copilot CLI model-discovery help command for a specific binary path. */
export function buildCopilotCliModelDiscoveryCommand(aiPath: string): CliModelDiscoveryCommand {
  if (isGhWrapperCommand(aiPath)) {
    return {
      command: aiPath,
      args: ["copilot", "--", "--help"],
      sourceLabel: "gh copilot -- --help"
    };
  }

  return {
    command: aiPath,
    args: ["--help"],
    sourceLabel: `${path.basename(aiPath)} --help`
  };
}

/** Unified provider definition for the Copilot CLI provider. */
export const COPILOT_CLI_PROVIDER_DEFINITION = {
  kind: "copilot",
  aliases: ["copilot"],
  preset: {
    kind: "copilot",
    quickPickLabel: "Copilot CLI",
    displayLabel: "Copilot CLI",
    defaultPath: "gh"
  },
  isCli: true,
  cliImplementation: COPILOT_CLI_PROVIDER,
  runtime: createCliAiRuntime("copilot"),
  getCliModelDiscoveryCommand: buildCopilotCliModelDiscoveryCommand,
  async discoverModels(options) {
    const invocation = buildCopilotCliModelDiscoveryCommand(options.aiPath);
    const timeoutMs = options.timeoutMs ?? 10000;

    try {
      const result = await runCliModelDiscoveryCommand(invocation.command, invocation.args, timeoutMs);
      if (result.code !== 0) {
        throw new AiModelDiscoveryError(
          `Failed to inspect available models via ${invocation.sourceLabel} (exit ${result.code}).`
        );
      }

      const models = parseModelChoicesFromHelp(`${result.stdout}\n${result.stderr}`);
      if (models.length === 0) {
        return {
          models: [...COPILOT_CLI_PROVIDER_FALLBACK_MODELS],
          sourceLabel: "Built-in Copilot CLI fallback list",
          usedFallback: true,
          warningMessage: `Saurus: could not parse models from ${invocation.sourceLabel}; using fallback list.`
        };
      }

      return {
        models,
        sourceLabel: invocation.sourceLabel,
        usedFallback: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown model discovery error.";
      return {
        models: [...COPILOT_CLI_PROVIDER_FALLBACK_MODELS],
        sourceLabel: "Built-in Copilot CLI fallback list",
        usedFallback: true,
        warningMessage: `Saurus: ${message} Using fallback Copilot model list.`
      };
    }
  }
} satisfies AiProviderDefinition<"copilot">;
