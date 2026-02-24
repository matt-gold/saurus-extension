import { AiProviderKind } from "../../types";

/** Default value for ai provider. */
export const DEFAULT_AI_PROVIDER: AiProviderKind = "copilotChat";

/** Describes a built-in ai provider preset. */
/** Describes a built-in ai provider preset. */
export type AiProviderPreset = {
    kind: AiProviderKind;
    quickPickLabel: string;
    displayLabel: string;
    defaultPath: string;
};

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

/** Implements sanitize ai provider. */
export function sanitizeAiProvider(input: string): AiProviderKind {
  const normalized = input.trim().toLowerCase();
  return AI_PROVIDER_ALIASES[normalized] ?? DEFAULT_AI_PROVIDER;
}

/** Returns default ai path. */
export function getDefaultAiPath(provider: AiProviderKind): string {
  return getPreset(provider)?.defaultPath ?? "codex";
}

/** Returns ai provider label. */
export function getAiProviderLabel(provider: AiProviderKind): string {
  return getPreset(provider)?.displayLabel ?? provider;
}

/** Returns whether cli ai provider. */
export function isCliAiProvider(provider: AiProviderKind): boolean {
  return provider !== "copilotChat";
}

/** Implements list ai provider presets. */
export function listAiProviderPresets(): readonly AiProviderPreset[] {
  return AI_PROVIDER_PRESETS;
}
