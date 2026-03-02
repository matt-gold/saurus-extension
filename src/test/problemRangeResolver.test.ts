import test from "node:test";
import assert from "node:assert/strict";
import { resolveProblemIssueRanges } from "../core/problems";
import { ProblemIssue } from "../types";

function createIssue(overrides: Partial<ProblemIssue>): ProblemIssue {
  return {
    question: "Could this be clearer?",
    category: "clarity",
    severity: "medium",
    confidence: 0.8,
    rationale: "Default rationale.",
    flaggedText: "default",
    startOffset: 0,
    endOffset: 7,
    fixHint: "Default fix hint.",
    ...overrides
  };
}

test("anchors with valid offsets first", () => {
  const analyzedText = "alpha beta gamma";
  const issues = [
    createIssue({
      flaggedText: "beta",
      startOffset: 6,
      endOffset: 10
    })
  ];

  const result = resolveProblemIssueRanges({ analyzedText, issues });
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].anchorSource, "offset");
  assert.deepEqual(result.resolved[0].span, { start: 6, end: 10 });
});

test("falls back to text search when offsets are invalid", () => {
  const analyzedText = "alpha beta gamma";
  const issues = [
    createIssue({
      flaggedText: "beta",
      startOffset: 100,
      endOffset: 120
    })
  ];

  const result = resolveProblemIssueRanges({ analyzedText, issues });
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].anchorSource, "textSearch");
  assert.deepEqual(result.resolved[0].span, { start: 6, end: 10 });
});

test("disambiguates duplicate snippets using nearest offset and overlap rules", () => {
  const analyzedText = "beta one beta two beta";
  const issues = [
    createIssue({
      flaggedText: "beta",
      startOffset: 0,
      endOffset: 4
    }),
    createIssue({
      flaggedText: "beta",
      startOffset: 11,
      endOffset: 15
    })
  ];

  const result = resolveProblemIssueRanges({ analyzedText, issues });
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.resolved.length, 2);
  assert.deepEqual(result.resolved[0].span, { start: 0, end: 4 });
  assert.deepEqual(result.resolved[1].span, { start: 9, end: 13 });
});

test("drops unresolved issues when no anchor can be found", () => {
  const analyzedText = "alpha beta gamma";
  const issues = [
    createIssue({
      flaggedText: "does-not-exist",
      startOffset: 50,
      endOffset: 70
    })
  ];

  const result = resolveProblemIssueRanges({ analyzedText, issues });
  assert.equal(result.resolved.length, 0);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].reason, "noAnchorMatch");
});
