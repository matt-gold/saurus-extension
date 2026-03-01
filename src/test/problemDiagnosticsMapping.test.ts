import test from "node:test";
import assert from "node:assert/strict";
import { formatProblemDiagnosticMessage, mapProblemSeverityToDiagnosticSeverity } from "../core/problems";
import { ProblemIssue } from "../types";

function createIssue(overrides: Partial<ProblemIssue>): ProblemIssue {
  return {
    question: "Could this sentence be tighter?",
    category: "clarity",
    severity: "medium",
    confidence: 0.83,
    rationale: "The clause is wordy.",
    flaggedText: "in a way that is",
    startOffset: 10,
    endOffset: 24,
    fixHint: "Remove filler phrasing.",
    ...overrides
  };
}

test("maps problem severity to diagnostic severity kinds", () => {
  assert.equal(mapProblemSeverityToDiagnosticSeverity("high"), "error");
  assert.equal(mapProblemSeverityToDiagnosticSeverity("medium"), "warning");
  assert.equal(mapProblemSeverityToDiagnosticSeverity("low"), "information");
});

test("formats diagnostic message with question, rationale, fix, and metadata", () => {
  const message = formatProblemDiagnosticMessage(createIssue({}));

  assert.match(message, /Could this sentence be tighter\?/);
  assert.match(message, /Why it matters: The clause is wordy\./);
  assert.match(message, /Fix hint: Remove filler phrasing\./);
  assert.match(message, /Category: clarity/);
  assert.match(message, /Confidence: 83%/);
});
