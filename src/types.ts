import * as vscode from "vscode";
import type { AiProviderKind, CliAiProviderKind } from "./services/ai/providers";

export type { AiProviderKind, CliAiProviderKind } from "./services/ai/providers";

/** Describes generation state. */
export type GenerationState = "idle" | "generating" | "ready" | "error";
/** Describes ai reasoning effort. */
export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
/** Describes suggestion source. */
export type SuggestionSource = "thesaurus" | "ai";
/** Describes suggestion source filter. */
export type SuggestionSourceFilter = "all" | "aiOnly" | "thesaurusOnly";
/** Represents activation modes. */
export type ActivationMode = "hybrid" | "ai" | "thesaurus";
/** Represents thesaurus provider kinds. */
export type ThesaurusProviderKind = "merriamWebster";

/** Describes source generation states. */
/** Describes source generation states. */
export type SourceGenerationStates = {
    thesaurus: GenerationState;
    ai: GenerationState;
};

/** Describes delimiter pair. */
/** Describes delimiter pair. */
export type DelimiterPair = {
    open: string;
    close: string;
};

/** Describes saurus settings. */
/** Describes saurus settings. */
export type SaurusSettings = {
    enabled: boolean;
    languages: string[];
    delimiters: DelimiterPair;
    promptTemplate: string;
    problemFinderPromptTemplate: string;
    activationModeOnEnter: ActivationMode;
    suggestionCount: number;
    problemFinderMaxIssues: number;
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
    thesaurusTimeoutMs: number;
    thesaurusMaxSuggestions: number;
    cachePersistAcrossReload: boolean;
    cachePersistTtlDays: number;
};

/** Describes placeholder match. */
/** Describes placeholder match. */
export type PlaceholderMatch = {
    fullRange: vscode.Range;
    innerRange: vscode.Range;
    rawInnerText: string;
    rawFullText: string;
    open: string;
    close: string;
};

/** Describes suggestion key. */
export type SuggestionKey = string;

/** Represents a suggestion cache entry. */
/** Represents a suggestion cache entry. */
export type SuggestionCacheEntry = {
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
};

/** Describes thesaurus lookup info. */
/** Describes thesaurus lookup info. */
export type ThesaurusLookupInfo = {
    provider: string;
    query: string;
    entryCount: number;
    suggestionCount: number;
    partOfSpeech?: string;
    definitions: string[];
    stems: string[];
    didYouMean: string[];
};

/** Describes suggestion request. */
/** Describes suggestion request. */
export type SuggestionRequest = {
    placeholder: string;
    contextBefore: string;
    contextAfter: string;
    suggestionCount: number;
    avoidSuggestions: string[];
    direction: string;
    fileName: string;
    languageId: string;
};

/** Describes suggestion response. */
/** Describes suggestion response. */
export type SuggestionResponse = {
    suggestions: string[];
};

/** Describes problem severity returned by the AI problem finder. */
export type ProblemSeverity = "low" | "medium" | "high";

/** Describes problem category returned by the AI problem finder. */
export type ProblemCategory =
    | "clarity"
    | "flow"
    | "structure"
    | "tone"
    | "grammar"
    | "punctuation"
    | "repetition"
    | "logic"
    | "consistency"
    | "voice"
    | "style"
    | "other";

/** Describes one AI-detected writing problem. */
export type ProblemIssue = {
    question: string;
    category: ProblemCategory;
    severity: ProblemSeverity;
    confidence: number;
    rationale: string;
    flaggedText: string;
    startOffset: number;
    endOffset: number;
    fixHint: string;
};

/** Describes AI problem-finder response payload. */
export type ProblemFinderResponse = {
    issues: ProblemIssue[];
};

/** Represents the result of build context. */
/** Represents the result of build context. */
export type BuildContextResult = {
    contextBefore: string;
    contextAfter: string;
    startOffset: number;
    endOffset: number;
};

/** Describes suggestion key data. */
/** Describes suggestion key data. */
export type SuggestionKeyData = {
    key: SuggestionKey;
    aiCacheKey: SuggestionKey;
    thesaurusCacheKey: SuggestionKey;
    contextBefore: string;
    contextAfter: string;
    promptTemplateHash: string;
};
