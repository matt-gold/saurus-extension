import type { AiProviderDefinition } from "./types";

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

/** Unified provider definition for VS Code Copilot Chat. */
export const COPILOT_CHAT_PROVIDER_DEFINITION = {
  kind: "copilotChat",
  aliases: ["copilotchat", "copilot-chat"],
  preset: {
    kind: "copilotChat",
    quickPickLabel: "Copilot Chat (default)",
    displayLabel: "Copilot Chat",
    defaultPath: ""
  },
  isDefault: true,
  isCli: false,
  runtime: {
    kind: "copilotChat",
    canGenerateInBackground(options) {
      const { canUseCopilotChatInBackground } = require("../copilotChatClient") as typeof import("../copilotChatClient");
      return canUseCopilotChatInBackground(options.extensionContext, options.model);
    },
    generate(request) {
      const { generateSuggestionsWithCopilotChat } = require("../copilotChatClient") as typeof import("../copilotChatClient");
      return generateSuggestionsWithCopilotChat({
        model: request.model,
        timeoutMs: request.timeoutMs,
        prompt: request.prompt,
        justification: request.userInitiated
          ? "Saurus needs Copilot Chat to generate replacement suggestions for your placeholder."
          : undefined
      });
    },
    generateProblems(request) {
      const { generateProblemsWithCopilotChat } = require("../copilotChatClient") as typeof import("../copilotChatClient");
      return generateProblemsWithCopilotChat({
        model: request.model,
        timeoutMs: request.timeoutMs,
        prompt: request.prompt,
        justification: request.userInitiated
          ? "Saurus needs Copilot Chat to diagnose writing problems in your document."
          : undefined
      });
    }
  },
  async discoverModels() {
    const vscode = require("vscode") as typeof import("vscode");
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    return {
      models: uniqueSorted(models.map((model) => model.id)),
      sourceLabel: "VS Code Copilot Chat models",
      usedFallback: false
    };
  }
} satisfies AiProviderDefinition<"copilotChat">;
