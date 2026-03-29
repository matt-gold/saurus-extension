import type { SuggestionProviderGenerateRequest, SuggestionProvider } from "../types";

/** Builds runtime AI generation behavior for a CLI-backed provider kind. */
export function createCliAiRuntime<K extends string>(kind: K): SuggestionProvider<K> {
  return {
    kind,
    async canGenerateInBackground(): Promise<boolean> {
      return true;
    },
    async generate(request: SuggestionProviderGenerateRequest) {
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
    },
    async generateProblems(request: SuggestionProviderGenerateRequest) {
      const { generateProblemsWithAi } = require("../../cliAiClient") as typeof import("../../cliAiClient");
      type CliProviderKind = Parameters<typeof generateProblemsWithAi>[0]["aiProvider"];
      return generateProblemsWithAi({
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
