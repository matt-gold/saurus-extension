import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { CODEX_CLI_PROVIDER } from "../internal/cliProviders/CodexCliProvider";
import { createCliAiRuntime } from "./internal/createCliAiRuntime";
import { CliModelDiscoveryCommand, parseCodexModelsCache } from "../modelDiscoveryShared";
import type { AiProviderDefinition } from "./types";

function buildDirectHelpModelDiscoveryCommand(aiPath: string): CliModelDiscoveryCommand {
  return {
    command: aiPath,
    args: ["--help"],
    sourceLabel: `${path.basename(aiPath)} --help`
  };
}

/** Built-in fallback model list for the Codex CLI provider. */
export const CODEX_PROVIDER_FALLBACK_MODELS: readonly string[] = [
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex"
] as const;

/** Unified provider definition for the Codex CLI provider. */
export const CODEX_PROVIDER_DEFINITION = {
  kind: "codex",
  aliases: ["codex"],
  preset: {
    kind: "codex",
    quickPickLabel: "Codex CLI",
    displayLabel: "Codex",
    defaultPath: "codex"
  },
  isCli: true,
  cliImplementation: CODEX_CLI_PROVIDER,
  runtime: createCliAiRuntime("codex"),
  getCliModelDiscoveryCommand: buildDirectHelpModelDiscoveryCommand,
  async discoverModels() {
    const cachePath = path.join(os.homedir(), ".codex", "models_cache.json");
    try {
      const raw = await fs.readFile(cachePath, "utf8");
      const models = parseCodexModelsCache(raw);
      if (models.length === 0) {
        return {
          models: [...CODEX_PROVIDER_FALLBACK_MODELS],
          sourceLabel: "Built-in Codex fallback list",
          usedFallback: true,
          warningMessage: `Saurus: no supported models found in ${cachePath}; using fallback Codex model list.`
        };
      }
      return {
        models,
        sourceLabel: `${cachePath} (supported_in_api, sorted)`,
        usedFallback: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown model discovery error.";
      return {
        models: [...CODEX_PROVIDER_FALLBACK_MODELS],
        sourceLabel: "Built-in Codex fallback list",
        usedFallback: true,
        warningMessage: `Saurus: ${message} Using fallback Codex model list.`
      };
    }
  }
} satisfies AiProviderDefinition<"codex">;
