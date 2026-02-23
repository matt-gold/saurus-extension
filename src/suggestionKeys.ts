import { hashText } from "./prompt";
import { extractThesaurusLookupTerm } from "./thesaurusClient";
import { AiProviderKind, AiReasoningEffort, DelimiterPair, ThesaurusProviderKind } from "./types";

export interface AiSemanticCacheKeyInput {
  placeholder: string;
  contextBefore: string;
  contextAfter: string;
  aiProvider: AiProviderKind;
  aiPath: string;
  aiModel?: string;
  aiReasoningEffort: AiReasoningEffort;
  promptTemplateHash: string;
}

export interface ThesaurusSemanticCacheKeyInput {
  provider: ThesaurusProviderKind;
  rawPlaceholder: string;
}

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

export function buildThesaurusSemanticCacheKey(input: ThesaurusSemanticCacheKeyInput): string {
  const payload = JSON.stringify({
    provider: input.provider,
    term: extractThesaurusLookupTerm(input.rawPlaceholder).trim().toLowerCase()
  });

  return `thesaurus::${hashText(payload)}`;
}
