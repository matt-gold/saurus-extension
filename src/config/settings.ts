import * as vscode from "vscode";
import { ActivationMode, AiReasoningEffort, SaurusSettings, ThesaurusProviderKind } from "../types";
import { DEFAULT_AI_PROVIDER, getDefaultAiPath, sanitizeAiProvider } from "../services/ai";

/** Default value for prompt template. */
export const DEFAULT_PROMPT_TEMPLATE = `You are helping with literary prose revision. Provide ${"${suggestionCount}"} replacement options for the placeholder.

Return valid JSON only with this shape: {"suggestions":["..."]}.
Keep options concise and stylistically consistent with nearby prose.
Prefer single-word replacements whenever they preserve meaning and tone.
For multi-word placeholders, include multiple single-word options (ideally at least half of the list).
Use multi-word replacements only when a single word would lose essential meaning or voice.
Do not return options semantically identical to the avoid list (at minimum avoid exact normalized matches).

Placeholder text:
${"${placeholder}"}

Context before:
${"${contextBefore}"}

Context after:
${"${contextAfter}"}

Avoid suggestions:
${"${avoidSuggestions}"}

Additional direction (optional):
${"${direction}"}
`;

/** Default value for problem-finder prompt template. */
export const DEFAULT_PROBLEM_FINDER_PROMPT_TEMPLATE = `You are a writing revision assistant. Analyze the target text and identify up to ${"${issueCount}"} meaningful line-edit or revision problems.

Return valid JSON only with this shape:
{"issues":[{"question":"...","category":"clarity|flow|structure|tone|grammar|punctuation|repetition|logic|consistency|voice|style|other","severity":"low|medium|high","confidence":0.0,"rationale":"...","flaggedText":"...","startOffset":0,"endOffset":0,"fixHint":"..."}]}

Rules:
- Do not report spelling or typo issues.
- Phrase every issue as a constructive question.
- flaggedText must be an exact snippet from target text.
- startOffset/endOffset must be 0-based offsets relative to target text.
- endOffset must be greater than startOffset.
- Keep fixHint concise and actionable.
- Rank issues by impact (most important first).
- Do not repeat issues listed under "Previously dismissed issues" unless the text has materially changed and the concern is genuinely new.
- If there are no meaningful issues, return {"issues":[]}.

Scope: ${"${scope}"}
File name: ${"${fileName}"}
Language id: ${"${languageId}"}

Target text:
${"${targetText}"}

Context left:
${"${contextLeft}"}

Context right:
${"${contextRight}"}

Previously dismissed issues:
${"${dismissedIssues}"}
`;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeDelimiter(input: string, fallback: string): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

const DEFAULT_REASONING_EFFORT: AiReasoningEffort = "low";
const DEFAULT_ACTIVATION_MODE: ActivationMode = "hybrid";
const DEFAULT_THESAURUS_PROVIDER: ThesaurusProviderKind = "merriamWebster";
const DEFAULT_THESAURUS_PREFIX = "📖";
const DEFAULT_AI_PREFIX = "✨";
const REASONING_EFFORTS = new Set<AiReasoningEffort>(["none", "low", "medium", "high", "xhigh"]);
const ACTIVATION_MODES = new Set<ActivationMode>(["hybrid", "ai", "thesaurus"]);
const THESAURUS_PROVIDERS = new Set<ThesaurusProviderKind>(["merriamWebster"]);

function sanitizeReasoningEffort(input: string): AiReasoningEffort {
  const normalized = input.trim().toLowerCase() as AiReasoningEffort;
  return REASONING_EFFORTS.has(normalized) ? normalized : DEFAULT_REASONING_EFFORT;
}

function sanitizeActivationMode(input: string): ActivationMode {
  const normalized = input.trim().toLowerCase() as ActivationMode;
  return ACTIVATION_MODES.has(normalized) ? normalized : DEFAULT_ACTIVATION_MODE;
}

function sanitizeThesaurusProvider(input: string): ThesaurusProviderKind {
  const normalized = input.trim() as ThesaurusProviderKind;
  return THESAURUS_PROVIDERS.has(normalized) ? normalized : DEFAULT_THESAURUS_PROVIDER;
}

/** Returns settings. */
export function getSettings(document?: vscode.TextDocument): SaurusSettings {
  const cfg = vscode.workspace.getConfiguration("saurus", document);

  const languages = cfg.get<string[]>("languages", ["markdown", "plaintext"]);
  const suggestionCount = clampNumber(cfg.get<number>("suggestions.count", 10), 2, 20);
  const problemFinderMaxIssues = clampNumber(cfg.get<number>("problemFinder.maxIssues", 12), 1, 20);
  const aiTimeoutMs = Math.max(1000, cfg.get<number>("ai.timeoutMs", 60000));
  const autoTriggerDebounceMs = Math.max(50, cfg.get<number>("autoTrigger.debounceMs", 250));
  const thesaurusTimeoutMs = Math.max(500, cfg.get<number>("thesaurus.timeoutMs", 10000));
  const thesaurusMaxSuggestions = clampNumber(cfg.get<number>("thesaurus.maxSuggestions", 20), 1, 50);

  const aiProvider = sanitizeAiProvider(cfg.get<string>("ai.provider", DEFAULT_AI_PROVIDER));
  const aiPathRaw = cfg.get<string>("ai.path", "").trim();
  const aiModelRaw = cfg.get<string>("ai.model", "").trim();
  const aiReasoningEffortRaw = cfg.get<string>("ai.reasoningEffort", DEFAULT_REASONING_EFFORT);
  const activationModeRaw = cfg.get<string>("activation.modeOnEnter", DEFAULT_ACTIVATION_MODE);
  const thesaurusProviderRaw = cfg.get<string>("thesaurus.provider", DEFAULT_THESAURUS_PROVIDER);
  const aiAutoGenerateOnOpen = cfg.get<boolean>("ai.autoGenerateOnOpen", false);
  const cachePersistTtlDays = clampNumber(cfg.get<number>("cache.persistTtlDays", 7), 1, 30);

  return {
    enabled: cfg.get<boolean>("enabled", true),
    languages: Array.isArray(languages) ? languages.filter((id) => typeof id === "string" && id.length > 0) : ["markdown", "plaintext"],
    delimiters: {
      open: sanitizeDelimiter(cfg.get<string>("delimiters.open", "{{"), "{{"),
      close: sanitizeDelimiter(cfg.get<string>("delimiters.close", "}}"), "}}")
    },
    promptTemplate: cfg.get<string>("prompt.template", DEFAULT_PROMPT_TEMPLATE),
    problemFinderPromptTemplate: cfg.get<string>(
      "problemFinder.prompt.template",
      DEFAULT_PROBLEM_FINDER_PROMPT_TEMPLATE
    ),
    activationModeOnEnter: sanitizeActivationMode(activationModeRaw),
    suggestionCount,
    problemFinderMaxIssues,
    autoTriggerOnCursorEnter: cfg.get<boolean>("autoTrigger.onCursorEnter", true),
    autoTriggerDebounceMs,
    contextCharsBefore: Math.max(0, cfg.get<number>("context.charsBefore", 220)),
    contextCharsAfter: Math.max(0, cfg.get<number>("context.charsAfter", 140)),
    aiProvider,
    aiPath: aiPathRaw.length > 0
      ? aiPathRaw
      : getDefaultAiPath(aiProvider),
    aiModel: aiModelRaw.length > 0 ? aiModelRaw : undefined,
    aiReasoningEffort: sanitizeReasoningEffort(aiReasoningEffortRaw),
    aiTimeoutMs,
    aiAutoRun: aiAutoGenerateOnOpen,
    thesaurusPrefix: cfg.get<string>("menu.thesaurusPrefix", DEFAULT_THESAURUS_PREFIX),
    aiPrefix: cfg.get<string>("menu.aiPrefix", DEFAULT_AI_PREFIX),
    thesaurusEnabled: cfg.get<boolean>("thesaurus.enabled", false),
    thesaurusProvider: sanitizeThesaurusProvider(thesaurusProviderRaw),
    thesaurusApiKey: cfg.get<string>("thesaurus.apiKey", "").trim(),
    thesaurusTimeoutMs,
    thesaurusMaxSuggestions,
    cachePersistAcrossReload: cfg.get<boolean>("cache.persistAcrossReload", false),
    cachePersistTtlDays
  };
}

/** Disables auto trigger for workspace. */
export async function disableAutoTriggerForWorkspace(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("saurus");
  await cfg.update("autoTrigger.onCursorEnter", false, vscode.ConfigurationTarget.Workspace);
}
