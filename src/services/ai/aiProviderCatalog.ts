import { AiProviderKind } from "../../types";
import {
  getAiProviderDefinition,
  getDefaultAiProviderDefinition,
  listAiProviderDefinitions
} from "./providers";
import type { AiProviderPreset } from "./providers/types";

/** Default AI provider kind used when configuration is missing or invalid. */
export const DEFAULT_AI_PROVIDER: AiProviderKind = getDefaultAiProviderDefinition().kind;

/** Display metadata for a built-in AI provider option. */
export type { AiProviderPreset } from "./providers/types";

/** Normalizes a configured AI provider string to a known provider kind. */
export function sanitizeAiProvider(input: string): AiProviderKind {
  const normalized = input.trim().toLowerCase();
  for (const definition of listAiProviderDefinitions()) {
    if (definition.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return definition.kind;
    }
  }
  return DEFAULT_AI_PROVIDER;
}

/** Returns the default executable path for a provider kind. */
export function getDefaultAiPath(provider: AiProviderKind): string {
  return getAiProviderDefinition(provider).preset.defaultPath;
}

/** Returns the display label for a provider kind. */
export function getAiProviderLabel(provider: AiProviderKind): string {
  return getAiProviderDefinition(provider).preset.displayLabel;
}

/** Returns whether a provider kind is CLI-backed. */
export function isCliAiProvider(provider: AiProviderKind): boolean {
  return getAiProviderDefinition(provider).isCli;
}

/** Lists AI provider presets in UI display order. */
export function listAiProviderPresets(): readonly AiProviderPreset[] {
  return listAiProviderDefinitions().map((definition) => definition.preset);
}
