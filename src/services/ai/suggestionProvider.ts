import { AiProviderKind } from "../../types";
import { getAiProviderDefinition } from "./providers";
import type { SuggestionProvider } from "./providers/types";

export type {
  AiProviderBackgroundCheckOptions,
  SuggestionProvider,
  SuggestionProviderGenerateRequest
} from "./providers/types";

/** Returns the runtime suggestion provider implementation for a configured provider kind. */
export function createSuggestionProvider(kind: AiProviderKind): SuggestionProvider {
  return getAiProviderDefinition(kind).runtime;
}
