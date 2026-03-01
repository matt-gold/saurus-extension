import test from "node:test";
import assert from "node:assert/strict";
import { parseProblemFinderResponse } from "../services/ai/aiProblemResponseParser";

const createError = (message: string): Error => new Error(message);

test("parses valid problem-finder payload", () => {
  const raw = JSON.stringify({
    issues: [{
      question: "Could this transition be clearer",
      category: "clarity",
      severity: "medium",
      confidence: 0.74,
      rationale: "The pivot is abrupt.",
      flaggedText: "however the chapter suddenly",
      startOffset: 12,
      endOffset: 39,
      fixHint: "Add a short bridge sentence."
    }]
  });

  const result = parseProblemFinderResponse(raw, "Codex", createError);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].question, "Could this transition be clearer?");
  assert.equal(result.issues[0].category, "clarity");
});

test("extracts fenced JSON and normalizes fields", () => {
  const raw = [
    "Here you go:",
    "```json",
    JSON.stringify({
      issues: [{
        question: "Should this opening be tighter",
        category: "STYLE",
        severity: "HIGH",
        confidence: "0.95",
        rationale: "It repeats the same point twice.",
        flaggedText: "the same point and the same point",
        startOffset: 22.8,
        endOffset: 54.2,
        fixHint: "Remove one repeated clause."
      }]
    }),
    "```"
  ].join("\n");

  const result = parseProblemFinderResponse(raw, "Codex", createError);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].question, "Should this opening be tighter?");
  assert.equal(result.issues[0].category, "style");
  assert.equal(result.issues[0].severity, "high");
  assert.equal(result.issues[0].confidence, 0.95);
  assert.equal(result.issues[0].startOffset, 22);
  assert.equal(result.issues[0].endOffset, 54);
});

test("filters spelling-like findings", () => {
  const raw = JSON.stringify({
    issues: [
      {
        question: "Is there a typo here?",
        category: "other",
        severity: "low",
        confidence: 0.8,
        rationale: "Possible spelling issue.",
        flaggedText: "wierd",
        startOffset: 0,
        endOffset: 5,
        fixHint: "Correct the spelling."
      },
      {
        question: "Could this sentence be more direct?",
        category: "clarity",
        severity: "medium",
        confidence: 0.7,
        rationale: "The phrasing is circuitous.",
        flaggedText: "it is in a way that",
        startOffset: 20,
        endOffset: 36,
        fixHint: "Use one stronger verb."
      }
    ]
  });

  const result = parseProblemFinderResponse(raw, "Codex", createError);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].category, "clarity");
});

test("throws on invalid payload", () => {
  assert.throws(
    () => parseProblemFinderResponse("not-json", "Codex", createError),
    /Codex returned invalid problem-finder output/
  );
});
