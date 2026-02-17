import * as vscode from "vscode";
import { CodexReasoningEffort, SaurusSettings, ThesaurusProviderKind } from "./types";

export const DEFAULT_PROMPT_TEMPLATE = `You are helping with literary prose revision. Provide ${"${suggestionCount}"} replacement options for the placeholder.

Return valid JSON only with this shape: {"suggestions":["..."]}.
Keep options concise and stylistically consistent with nearby prose.
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeDelimiter(input: string, fallback: string): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

const DEFAULT_REASONING_EFFORT: CodexReasoningEffort = "low";
const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";
const DEFAULT_THESAURUS_PROVIDER: ThesaurusProviderKind = "merriamWebster";
const DEFAULT_THESAURUS_PREFIX = "📖";
const DEFAULT_AI_PREFIX = "✨";
const REASONING_EFFORTS = new Set<CodexReasoningEffort>(["none", "low", "medium", "high", "xhigh"]);
const THESAURUS_PROVIDERS = new Set<ThesaurusProviderKind>(["merriamWebster"]);

function sanitizeReasoningEffort(input: string): CodexReasoningEffort {
  const normalized = input.trim().toLowerCase() as CodexReasoningEffort;
  return REASONING_EFFORTS.has(normalized) ? normalized : DEFAULT_REASONING_EFFORT;
}

function sanitizeThesaurusProvider(input: string): ThesaurusProviderKind {
  const normalized = input.trim() as ThesaurusProviderKind;
  return THESAURUS_PROVIDERS.has(normalized) ? normalized : DEFAULT_THESAURUS_PROVIDER;
}

export function getSettings(document?: vscode.TextDocument): SaurusSettings {
  const cfg = vscode.workspace.getConfiguration("saurus", document);

  const languages = cfg.get<string[]>("languages", ["markdown", "plaintext"]);
  const suggestionCount = clampNumber(cfg.get<number>("suggestions.count", 10), 2, 20);
  const codexTimeoutMs = Math.max(1000, cfg.get<number>("codex.timeoutMs", 20000));
  const autoTriggerDebounceMs = Math.max(50, cfg.get<number>("autoTrigger.debounceMs", 250));
  const thesaurusTimeoutMs = Math.max(500, cfg.get<number>("thesaurus.timeoutMs", 10000));
  const thesaurusMaxSuggestions = clampNumber(cfg.get<number>("thesaurus.maxSuggestions", 20), 1, 50);

  const codexModelRaw = cfg.get<string>("codex.model", DEFAULT_CODEX_MODEL).trim();
  const codexReasoningEffortRaw = cfg.get<string>("codex.reasoningEffort", DEFAULT_REASONING_EFFORT);
  const thesaurusProviderRaw = cfg.get<string>("thesaurus.provider", DEFAULT_THESAURUS_PROVIDER);
  const aiAutoRunLegacy = cfg.get<boolean>("ai.autoRun", false);
  const aiAutoGenerateOnOpen = cfg.get<boolean>("ai.autoGenerateOnOpen", aiAutoRunLegacy);
  const cachePersistTtlDays = clampNumber(cfg.get<number>("cache.persistTtlDays", 7), 1, 30);

  return {
    enabled: cfg.get<boolean>("enabled", true),
    languages: Array.isArray(languages) ? languages.filter((id) => typeof id === "string" && id.length > 0) : ["markdown", "plaintext"],
    delimiters: {
      open: sanitizeDelimiter(cfg.get<string>("delimiters.open", "{{"), "{{"),
      close: sanitizeDelimiter(cfg.get<string>("delimiters.close", "}}"), "}}")
    },
    promptTemplate: cfg.get<string>("prompt.template", DEFAULT_PROMPT_TEMPLATE),
    suggestionCount,
    autoTriggerOnCursorEnter: cfg.get<boolean>("autoTrigger.onCursorEnter", true),
    autoTriggerDebounceMs,
    contextCharsBefore: Math.max(0, cfg.get<number>("context.charsBefore", 220)),
    contextCharsAfter: Math.max(0, cfg.get<number>("context.charsAfter", 140)),
    codexPath: cfg.get<string>("codex.path", "codex"),
    codexModel: codexModelRaw.length > 0 ? codexModelRaw : DEFAULT_CODEX_MODEL,
    codexReasoningEffort: sanitizeReasoningEffort(codexReasoningEffortRaw),
    codexTimeoutMs,
    aiAutoRun: aiAutoGenerateOnOpen,
    thesaurusPrefix: cfg.get<string>("menu.thesaurusPrefix", DEFAULT_THESAURUS_PREFIX),
    aiPrefix: cfg.get<string>("menu.aiPrefix", DEFAULT_AI_PREFIX),
    thesaurusEnabled: cfg.get<boolean>("thesaurus.enabled", true),
    thesaurusProvider: sanitizeThesaurusProvider(thesaurusProviderRaw),
    thesaurusApiKey: cfg.get<string>("thesaurus.apiKey", "").trim(),
    thesaurusTimeoutMs,
    thesaurusMaxSuggestions,
    cachePersistAcrossReload: cfg.get<boolean>("cache.persistAcrossReload", false),
    cachePersistTtlDays
  };
}

export async function disableAutoTriggerForWorkspace(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("saurus");
  await cfg.update("autoTrigger.onCursorEnter", false, vscode.ConfigurationTarget.Workspace);
}
