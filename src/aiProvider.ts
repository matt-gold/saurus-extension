import { AiProviderKind } from "./types";

export const DEFAULT_AI_PROVIDER: AiProviderKind = "copilotChat";

export interface AiProviderPreset {
  kind: AiProviderKind;
  quickPickLabel: string;
  displayLabel: string;
  defaultPath: string;
}

const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    kind: "copilotChat",
    quickPickLabel: "Copilot Chat (default)",
    displayLabel: "Copilot Chat",
    defaultPath: ""
  },
  {
    kind: "copilot",
    quickPickLabel: "Copilot CLI",
    displayLabel: "Copilot CLI",
    defaultPath: "gh"
  },
  {
    kind: "claude",
    quickPickLabel: "Claude CLI",
    displayLabel: "Claude",
    defaultPath: "claude"
  },
  {
    kind: "codex",
    quickPickLabel: "Codex CLI",
    displayLabel: "Codex",
    defaultPath: "codex"
  }
] as const;

function getPreset(provider: AiProviderKind): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((preset) => preset.kind === provider);
}

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
  return getPreset(provider)?.defaultPath ?? "codex";
}

export function getAiProviderLabel(provider: AiProviderKind): string {
  return getPreset(provider)?.displayLabel ?? provider;
}

export function isCliAiProvider(provider: AiProviderKind): boolean {
  return provider !== "copilotChat";
}

export function listAiProviderPresets(): readonly AiProviderPreset[] {
  return AI_PROVIDER_PRESETS;
}
