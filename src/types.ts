import * as vscode from "vscode";

export type GenerationState = "idle" | "generating" | "ready" | "error";
export type CodexReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface DelimiterPair {
  open: string;
  close: string;
}

export interface SaurusSettings {
  enabled: boolean;
  languages: string[];
  delimiters: DelimiterPair;
  promptTemplate: string;
  suggestionCount: number;
  autoTriggerOnCursorEnter: boolean;
  autoTriggerDebounceMs: number;
  contextCharsBefore: number;
  contextCharsAfter: number;
  codexPath: string;
  codexModel?: string;
  codexReasoningEffort: CodexReasoningEffort;
  codexTimeoutMs: number;
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
  options: string[];
  seenNormalized: Set<string>;
  seenRaw: string[];
  createdAt: number;
  documentVersion: number;
  documentUri: string;
}

export interface SuggestionRequest {
  placeholder: string;
  contextBefore: string;
  contextAfter: string;
  suggestionCount: number;
  avoidSuggestions: string[];
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
