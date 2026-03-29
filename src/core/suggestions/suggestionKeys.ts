import { hashText } from "./promptTemplate";
import { AiProviderKind, AiReasoningEffort, DelimiterPair } from "../../types";

/** Describes suggestion semantic cache key input. */
export type SuggestionSemanticCacheKeyInput = {
  placeholder: string;
  direction: string;
  contextBefore: string;
  contextAfter: string;
  aiProvider: AiProviderKind;
  aiPath: string;
  aiModel?: string;
  aiReasoningEffort: AiReasoningEffort;
  promptTemplateHash: string;
};

/** Removes placeholder delimiters from nearby context while keeping the text itself. */
export function normalizeAiAdjacentContext(text: string, delimiters: DelimiterPair): string {
  let normalized = text;
  if (delimiters.open.length > 0) {
    normalized = normalized.split(delimiters.open).join("");
  }
  if (delimiters.close.length > 0) {
    normalized = normalized.split(delimiters.close).join("");
  }
  return normalized;
}

/** Builds a semantic cache key for suggestion generation. */
export function buildSuggestionSemanticCacheKey(input: SuggestionSemanticCacheKeyInput): string {
  const payload = JSON.stringify({
    placeholder: input.placeholder,
    direction: input.direction,
    contextBefore: input.contextBefore,
    contextAfter: input.contextAfter,
    aiProvider: input.aiProvider,
    aiPath: input.aiPath,
    aiModel: input.aiModel ?? "",
    aiReasoningEffort: input.aiReasoningEffort,
    promptTemplateHash: input.promptTemplateHash
  });

  return `suggestion::${hashText(payload)}`;
}
