import { ProblemCategory, ProblemFinderResponse, ProblemIssue, ProblemSeverity } from "../../types";

type ParseContext = {
  providerLabel: string;
  createError: (message: string) => Error;
};

const PROBLEM_CATEGORIES = new Set<ProblemCategory>([
  "clarity",
  "flow",
  "structure",
  "tone",
  "grammar",
  "punctuation",
  "repetition",
  "logic",
  "consistency",
  "voice",
  "style",
  "other"
]);

const SPELLING_PATTERNS = [
  /\bspelling\b/i,
  /\btypo(?:s)?\b/i,
  /\bmisspell(?:ed|ing)?\b/i,
  /\borthograph(?:y|ic)\b/i
];

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeQuestion(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = normalizeInlineText(value);
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.endsWith("?") ? trimmed : `${trimmed}?`;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = normalizeInlineText(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCategory(value: unknown): ProblemCategory {
  if (typeof value !== "string") {
    return "other";
  }

  const normalized = value.trim().toLowerCase() as ProblemCategory;
  return PROBLEM_CATEGORIES.has(normalized) ? normalized : "other";
}

function normalizeSeverity(value: unknown): ProblemSeverity {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }

  return "medium";
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
    return 0.6;
  }

  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0.6;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeOffset(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
}

function hasSpellingSignals(issue: ProblemIssue): boolean {
  if (issue.category === "grammar") {
    // Grammar issues are in scope; do not filter all grammar.
    return false;
  }

  const combined = `${issue.category} ${issue.question} ${issue.rationale} ${issue.fixHint}`;
  return SPELLING_PATTERNS.some((pattern) => pattern.test(combined));
}

function normalizeIssue(value: unknown): ProblemIssue | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const issue = value as {
    question?: unknown;
    category?: unknown;
    severity?: unknown;
    confidence?: unknown;
    rationale?: unknown;
    flaggedText?: unknown;
    startOffset?: unknown;
    endOffset?: unknown;
    fixHint?: unknown;
  };

  const question = normalizeQuestion(issue.question);
  const rationale = normalizeNonEmptyString(issue.rationale);
  const flaggedText = normalizeNonEmptyString(issue.flaggedText);
  const fixHint = normalizeNonEmptyString(issue.fixHint) ?? "Could this section be revised to improve clarity and flow?";
  if (!question || !rationale || !flaggedText) {
    return undefined;
  }

  const startOffset = normalizeOffset(issue.startOffset, -1);
  const endOffset = normalizeOffset(issue.endOffset, -1);

  const normalizedIssue: ProblemIssue = {
    question,
    category: normalizeCategory(issue.category),
    severity: normalizeSeverity(issue.severity),
    confidence: normalizeConfidence(issue.confidence),
    rationale,
    flaggedText,
    startOffset,
    endOffset,
    fixHint
  };

  if (hasSpellingSignals(normalizedIssue)) {
    return undefined;
  }

  return normalizedIssue;
}

function parseProblemFinderJson(raw: string): ProblemFinderResponse | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  const payload = parsed as { issues?: unknown };
  if (!Array.isArray(payload.issues)) {
    return undefined;
  }

  return {
    issues: payload.issues
      .map((entry) => normalizeIssue(entry))
      .filter((entry): entry is ProblemIssue => Boolean(entry))
  };
}

function extractJsonCandidate(raw: string): string | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const object = raw.match(/\{[\s\S]*\}/);
  if (object?.[0]) {
    return object[0].trim();
  }

  return undefined;
}

/** Parses AI problem-finder output into normalized problem issues. */
export function parseProblemFinderResponse(
  raw: string,
  providerLabel: string,
  createError: (message: string) => Error
): ProblemFinderResponse {
  const context: ParseContext = {
    providerLabel,
    createError
  };

  const fromRaw = parseProblemFinderJson(raw);
  if (fromRaw) {
    return fromRaw;
  }

  const jsonCandidate = extractJsonCandidate(raw);
  if (jsonCandidate) {
    const fromCandidate = parseProblemFinderJson(jsonCandidate);
    if (fromCandidate) {
      return fromCandidate;
    }
  }

  throw context.createError(`${context.providerLabel} returned invalid problem-finder output.`);
}
