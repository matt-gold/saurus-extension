import { hashText } from "./promptTemplate";
import { extractThesaurusLookupTerm } from "./thesaurusLookupTerm";
import { AiProviderKind, AiReasoningEffort, DelimiterPair, ThesaurusProviderKind } from "../../types";

/** Describes ai semantic cache key input. */
/** Describes ai semantic cache key input. */
export type AiSemanticCacheKeyInput = {
    placeholder: string;
    contextBefore: string;
    contextAfter: string;
    aiProvider: AiProviderKind;
    aiPath: string;
    aiModel?: string;
    aiReasoningEffort: AiReasoningEffort;
    promptTemplateHash: string;
};

/** Describes thesaurus semantic cache key input. */
/** Describes thesaurus semantic cache key input. */
export type ThesaurusSemanticCacheKeyInput = {
    provider: ThesaurusProviderKind;
    rawPlaceholder: string;
};

/** Normalizes ai adjacent context. */
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

/** Builds ai semantic cache key. */
export function buildAiSemanticCacheKey(input: AiSemanticCacheKeyInput): string {
  const payload = JSON.stringify({
    placeholder: input.placeholder,
    contextBefore: input.contextBefore,
    contextAfter: input.contextAfter,
    aiProvider: input.aiProvider,
    aiPath: input.aiPath,
    aiModel: input.aiModel ?? "",
    aiReasoningEffort: input.aiReasoningEffort,
    promptTemplateHash: input.promptTemplateHash
  });

  return `ai::${hashText(payload)}`;
}

/** Builds thesaurus semantic cache key. */
export function buildThesaurusSemanticCacheKey(input: ThesaurusSemanticCacheKeyInput): string {
  const payload = JSON.stringify({
    provider: input.provider,
    term: extractThesaurusLookupTerm(input.rawPlaceholder).trim().toLowerCase()
  });

  return `thesaurus::${hashText(payload)}`;
}
