import { ProblemIssue } from "../../types";

/** One text span anchored to analyzed text offsets. */
export type ProblemOffsetSpan = {
  start: number;
  end: number;
};

/** One AI problem resolved to a concrete editor range. */
export type ResolvedProblemIssue = {
  issue: ProblemIssue;
  span: ProblemOffsetSpan;
  anchorSource: "offset" | "textSearch";
};

/** Inputs for mapping AI problem offsets/snippets back to analyzed text spans. */
export type ResolveProblemIssueRangesInput = {
  analyzedText: string;
  issues: ProblemIssue[];
};

/** Outputs of problem range resolution. */
export type ResolveProblemIssueRangesResult = {
  resolved: ResolvedProblemIssue[];
  unresolvedCount: number;
};

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function roughlyMatchesFlaggedText(spanText: string, flaggedText: string): boolean {
  const normalizedSpan = normalizeComparableText(spanText);
  const normalizedFlagged = normalizeComparableText(flaggedText);
  if (normalizedSpan.length === 0 || normalizedFlagged.length === 0) {
    return false;
  }

  return normalizedSpan === normalizedFlagged ||
    normalizedSpan.includes(normalizedFlagged) ||
    normalizedFlagged.includes(normalizedSpan);
}

function spansOverlap(left: ProblemOffsetSpan, right: ProblemOffsetSpan): boolean {
  return left.start < right.end && right.start < left.end;
}

function buildOffsetAnchorCandidate(issue: ProblemIssue, analyzedText: string): ProblemOffsetSpan | undefined {
  const start = Math.trunc(issue.startOffset);
  const end = Math.trunc(issue.endOffset);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return undefined;
  }
  if (start < 0 || end <= start || end > analyzedText.length) {
    return undefined;
  }

  const candidateText = analyzedText.slice(start, end);
  if (!roughlyMatchesFlaggedText(candidateText, issue.flaggedText)) {
    return undefined;
  }

  return { start, end };
}

function collectSnippetSearchCandidates(analyzedText: string, snippet: string): ProblemOffsetSpan[] {
  const trimmed = snippet.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const matches: ProblemOffsetSpan[] = [];
  let searchFrom = 0;
  while (searchFrom < analyzedText.length) {
    const index = analyzedText.indexOf(trimmed, searchFrom);
    if (index < 0) {
      break;
    }
    matches.push({ start: index, end: index + trimmed.length });
    searchFrom = index + Math.max(1, trimmed.length);
  }

  if (matches.length > 0) {
    return matches;
  }

  const haystack = analyzedText.toLowerCase();
  const needle = trimmed.toLowerCase();
  searchFrom = 0;
  while (searchFrom < haystack.length) {
    const index = haystack.indexOf(needle, searchFrom);
    if (index < 0) {
      break;
    }
    matches.push({ start: index, end: index + needle.length });
    searchFrom = index + Math.max(1, needle.length);
  }

  return matches;
}

function chooseNonOverlappingCandidate(
  candidates: ProblemOffsetSpan[],
  preferredStart: number,
  acceptedSpans: ProblemOffsetSpan[]
): ProblemOffsetSpan | undefined {
  const sorted = [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(left.start - preferredStart);
    const rightDistance = Math.abs(right.start - preferredStart);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.start - right.start;
  });

  return sorted.find((candidate) => acceptedSpans.every((accepted) => !spansOverlap(candidate, accepted)));
}

/** Resolves AI issues to analyzed text spans using offsets first and flagged-text search as fallback. */
export function resolveProblemIssueRanges(input: ResolveProblemIssueRangesInput): ResolveProblemIssueRangesResult {
  const acceptedSpans: ProblemOffsetSpan[] = [];
  const resolved: ResolvedProblemIssue[] = [];
  let unresolvedCount = 0;

  for (const issue of input.issues) {
    let chosenSpan = buildOffsetAnchorCandidate(issue, input.analyzedText);
    let anchorSource: ResolvedProblemIssue["anchorSource"] = "offset";
    const offsetSpan = chosenSpan;
    const overlapsAcceptedSpan = offsetSpan
      ? acceptedSpans.some((accepted) => spansOverlap(offsetSpan, accepted))
      : false;

    if (!chosenSpan || overlapsAcceptedSpan) {
      const snippetCandidates = collectSnippetSearchCandidates(input.analyzedText, issue.flaggedText);
      const fallbackCandidate = chooseNonOverlappingCandidate(
        snippetCandidates,
        Math.max(0, Math.trunc(issue.startOffset)),
        acceptedSpans
      );
      if (!fallbackCandidate) {
        unresolvedCount += 1;
        continue;
      }
      chosenSpan = fallbackCandidate;
      anchorSource = "textSearch";
    }

    if (!chosenSpan) {
      unresolvedCount += 1;
      continue;
    }

    acceptedSpans.push(chosenSpan);
    resolved.push({
      issue,
      span: chosenSpan,
      anchorSource
    });
  }

  return {
    resolved,
    unresolvedCount
  };
}
