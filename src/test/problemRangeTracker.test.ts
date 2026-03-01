import test from "node:test";
import assert from "node:assert/strict";
import {
  applyChangeToTrackedIssue,
  ProblemRangeTracker,
  ProblemContentChange,
  TrackedProblemIssue
} from "../core/problems";

function trackedIssue(startLine: number, startChar: number, endLine: number, endChar: number): TrackedProblemIssue {
  return {
    id: "problem-1",
    issue: {
      question: "Could this transition be clearer?",
      category: "clarity",
      severity: "medium",
      confidence: 0.8,
      rationale: "The transition is abrupt.",
      flaggedText: "however then",
      startOffset: 0,
      endOffset: 12,
      fixHint: "Add a bridge phrase."
    },
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
    deleted: false,
    dirty: false
  };
}

function change(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
  text: string
): ProblemContentChange {
  return {
    range: {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar }
    },
    text
  };
}

test("change before range shifts start and end", () => {
  const issue = trackedIssue(5, 0, 5, 10);
  applyChangeToTrackedIssue(issue, change(2, 0, 2, 0, "new line\n"));

  assert.deepEqual(issue.start, { line: 6, character: 0 });
  assert.deepEqual(issue.end, { line: 6, character: 10 });
  assert.equal(issue.dirty, true);
  assert.equal(issue.deleted, false);
});

test("change inside range adjusts end", () => {
  const issue = trackedIssue(3, 0, 3, 20);
  applyChangeToTrackedIssue(issue, change(3, 10, 3, 10, "XXXXX"));

  assert.deepEqual(issue.start, { line: 3, character: 0 });
  assert.deepEqual(issue.end, { line: 3, character: 25 });
  assert.equal(issue.dirty, true);
});

test("change fully deleting range marks issue deleted", () => {
  const issue = trackedIssue(3, 5, 3, 15);
  applyChangeToTrackedIssue(issue, change(3, 0, 3, 20, " "));

  assert.equal(issue.deleted, true);
  assert.equal(issue.dirty, true);
});

test("ProblemRangeTracker applies sorted changes and removeIssue works", () => {
  const tracker = new ProblemRangeTracker();
  const uri = "file:///test.md";
  tracker.load(uri, [trackedIssue(4, 0, 4, 10)]);

  tracker.applyChanges(uri, [
    change(5, 0, 5, 0, "after\n"),
    change(1, 0, 1, 0, "before\n")
  ]);

  const tracked = tracker.getTracked(uri);
  assert.ok(tracked);
  assert.equal(tracked!.length, 1);
  assert.deepEqual(tracked![0].start, { line: 5, character: 0 });
  assert.deepEqual(tracked![0].end, { line: 5, character: 10 });

  tracker.removeIssue(uri, "problem-1");
  assert.equal(tracker.getTracked(uri)?.length, 0);
});
