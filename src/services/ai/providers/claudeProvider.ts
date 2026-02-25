import * as path from "path";
import { CLAUDE_CLI_PROVIDER } from "../internal/cliProviders/ClaudeCliProvider";
import { CliModelDiscoveryCommand } from "../modelDiscoveryShared";
import { createCliAiRuntime } from "./internal/createCliAiRuntime";
import type { AiProviderDefinition } from "./types";

function buildDirectHelpModelDiscoveryCommand(aiPath: string): CliModelDiscoveryCommand {
  return {
    command: aiPath,
    args: ["--help"],
    sourceLabel: `${path.basename(aiPath)} --help`
  };
}

/** Built-in model list for the Claude CLI provider. */
export const CLAUDE_PROVIDER_MODELS: readonly string[] = [
  "opus",
  "sonnet",
  "haiku"
] as const;

/** Unified provider definition for the Claude CLI provider. */
export const CLAUDE_PROVIDER_DEFINITION = {
  kind: "claude",
  aliases: ["claude"],
  preset: {
    kind: "claude",
    quickPickLabel: "Claude CLI",
    displayLabel: "Claude",
    defaultPath: "claude"
  },
  isCli: true,
  cliImplementation: CLAUDE_CLI_PROVIDER,
  runtime: createCliAiRuntime("claude"),
  getCliModelDiscoveryCommand: buildDirectHelpModelDiscoveryCommand,
  async discoverModels() {
    return {
      models: [...CLAUDE_PROVIDER_MODELS],
      sourceLabel: "Built-in Claude model list",
      usedFallback: false
    };
  }
} satisfies AiProviderDefinition<"claude">;
