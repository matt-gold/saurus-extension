import test from "node:test";
import assert from "node:assert/strict";
import { parsePlaceholderContent } from "../core/placeholder";

test("parsePlaceholderContent returns trimmed target text when no prompt metadata exists", () => {
  const parsed = parsePlaceholderContent("  arrived  ");

  assert.equal(parsed.targetText, "arrived");
  assert.equal(parsed.directionText, "");
  assert.equal(parsed.hasPrompt, false);
});

test("parsePlaceholderContent splits target text and prompt metadata on first token", () => {
  const parsed = parsePlaceholderContent("arrived :: more sudden :: keep cadence");

  assert.equal(parsed.targetText, "arrived");
  assert.equal(parsed.directionText, "more sudden :: keep cadence");
  assert.equal(parsed.separatorIndex, 8);
  assert.equal(parsed.hasPrompt, true);
});

test("parsePlaceholderContent allows detecting empty target text before prompt metadata", () => {
  const parsed = parsePlaceholderContent("   :: more exact");

  assert.equal(parsed.targetText, "");
  assert.equal(parsed.directionText, "more exact");
  assert.equal(parsed.hasPrompt, true);
});
