import { AiProviderKind } from "./types";

export const DEFAULT_AI_PROVIDER: AiProviderKind = "copilotChat";

const AI_PROVIDER_ALIASES: Record<string, AiProviderKind> = {
  copilotchat: "copilotChat",
  "copilot-chat": "copilotChat",
  copilot: "copilot",
  codex: "codex",
  claude: "claude"
};

export function sanitizeAiProvider(input: string): AiProviderKind {
  const normalized = input.trim().toLowerCase();
  return AI_PROVIDER_ALIASES[normalized] ?? DEFAULT_AI_PROVIDER;
}

export function getDefaultAiPath(provider: AiProviderKind): string {
  switch (provider) {
    case "copilotChat":
      return "";
    case "copilot":
      return "gh";
    case "claude":
      return "claude";
    case "codex":
    default:
      return "codex";
  }
}

export function getAiProviderLabel(provider: AiProviderKind): string {
  switch (provider) {
    case "copilotChat":
      return "Copilot Chat";
    case "copilot":
      return "Copilot CLI";
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    default:
      return provider;
  }
}

export function isCliAiProvider(provider: AiProviderKind): boolean {
  return provider !== "copilotChat";
}
