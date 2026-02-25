import { AiProviderKind } from "../../types";
import { getAiProviderDefinition } from "./providers";
import type { AiSuggestionProvider } from "./providers/types";

export type {
  AiProviderBackgroundCheckOptions,
  AiProviderGenerateRequest,
  AiSuggestionProvider
} from "./providers/types";

/** Returns the runtime AI provider implementation for a configured provider kind. */
export function createAiSuggestionProvider(kind: AiProviderKind): AiSuggestionProvider {
  return getAiProviderDefinition(kind).runtime;
}
