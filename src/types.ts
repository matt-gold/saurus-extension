import * as vscode from "vscode";

export type GenerationState = "idle" | "generating" | "ready" | "error";
export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type CodexReasoningEffort = AiReasoningEffort;
export type AiProviderKind = "codex" | "copilot" | "claude";
export type SuggestionSource = "thesaurus" | "ai";
export type SuggestionSourceFilter = "all" | "aiOnly" | "thesaurusOnly";
export type ActivationMode = "hybrid" | "ai" | "thesaurus";
export type ThesaurusProviderKind = "merriamWebster";

export interface SourceGenerationStates {
  thesaurus: GenerationState;
  ai: GenerationState;
}

export interface DelimiterPair {
  open: string;
  close: string;
}

export interface SaurusSettings {
  enabled: boolean;
  languages: string[];
  delimiters: DelimiterPair;
  promptTemplate: string;
  activationModeOnEnter: ActivationMode;
  suggestionCount: number;
  autoTriggerOnCursorEnter: boolean;
  autoTriggerDebounceMs: number;
  contextCharsBefore: number;
  contextCharsAfter: number;
  aiProvider: AiProviderKind;
  aiPath: string;
  aiModel?: string;
  aiReasoningEffort: AiReasoningEffort;
  aiTimeoutMs: number;
  aiAutoRun: boolean;
  thesaurusPrefix: string;
  aiPrefix: string;
  thesaurusEnabled: boolean;
  thesaurusProvider: ThesaurusProviderKind;
  thesaurusApiKey: string;
  thesaurusTimeoutMs: number;
  thesaurusMaxSuggestions: number;
  cachePersistAcrossReload: boolean;
  cachePersistTtlDays: number;
}

export interface PlaceholderMatch {
  fullRange: vscode.Range;
  innerRange: vscode.Range;
  rawInnerText: string;
  rawFullText: string;
  open: string;
  close: string;
}

export type SuggestionKey = string;

export interface SuggestionCacheEntry {
  thesaurusOptions: string[];
  aiOptions: string[];
  thesaurusInfo?: ThesaurusLookupInfo;
  thesaurusLastResponseCached: boolean;
  lastAiPrompt?: string;
  lastAiModel?: string;
  aiLoadedCount: number;
  aiLastAddedCount: number;
  aiLastResponseCached: boolean;
  seenNormalized: Set<string>;
  seenRaw: string[];
  createdAt: number;
  documentVersion: number;
  documentUri: string;
  lastAccessedAt: number;
}

export interface ThesaurusLookupInfo {
  provider: string;
  query: string;
  entryCount: number;
  suggestionCount: number;
  partOfSpeech?: string;
  definitions: string[];
  stems: string[];
  didYouMean: string[];
}

export interface SuggestionRequest {
  placeholder: string;
  contextBefore: string;
  contextAfter: string;
  suggestionCount: number;
  avoidSuggestions: string[];
  direction: string;
  fileName: string;
  languageId: string;
}

export interface SuggestionResponse {
  suggestions: string[];
}

export interface BuildContextResult {
  contextBefore: string;
  contextAfter: string;
  startOffset: number;
  endOffset: number;
}

export interface SuggestionKeyData {
  key: SuggestionKey;
  contextBefore: string;
  contextAfter: string;
  promptTemplateHash: string;
}
