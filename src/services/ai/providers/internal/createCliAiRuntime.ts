import type { AiProviderGenerateRequest, AiSuggestionProvider } from "../types";

/** Builds runtime AI generation behavior for a CLI-backed provider kind. */
export function createCliAiRuntime<K extends string>(kind: K): AiSuggestionProvider<K> {
  return {
    kind,
    async canGenerateInBackground(): Promise<boolean> {
      return true;
    },
    async generate(request: AiProviderGenerateRequest) {
      const { generateSuggestionsWithAi } = require("../../cliAiClient") as typeof import("../../cliAiClient");
      type CliProviderKind = Parameters<typeof generateSuggestionsWithAi>[0]["aiProvider"];
      return generateSuggestionsWithAi({
        aiProvider: kind as CliProviderKind,
        aiPath: request.aiPath,
        model: request.model,
        reasoningEffort: request.reasoningEffort,
        timeoutMs: request.timeoutMs,
        workspaceDir: request.workspaceDir,
        schemaPath: request.schemaPath,
        prompt: request.prompt
      });
    }
  };
}
