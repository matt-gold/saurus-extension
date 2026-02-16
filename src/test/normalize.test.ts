import test from "node:test";
import assert from "node:assert/strict";
import { addSuggestionsToSeen, dedupeSuggestions, normalizeSuggestion } from "../normalize";

test("normalization collapses punctuation and spacing", () => {
  const normalized = normalizeSuggestion("  Bell,   toll! ");
  assert.equal(normalized, "bell toll");
});

test("dedupeSuggestions filters against seen and local duplicates", () => {
  const seen = new Set<string>(["already known"]);
  const options = dedupeSuggestions(["Already known", "fresh option", "fresh option", "second fresh"], seen, 5);

  assert.deepEqual(options, ["fresh option", "second fresh"]);
});

test("addSuggestionsToSeen appends unique normalized options", () => {
  const seenNorm = new Set<string>();
  const seenRaw: string[] = [];

  addSuggestionsToSeen(["Bell Toll", "bell toll", "New Signal"], seenNorm, seenRaw);

  assert.equal(seenNorm.size, 2);
  assert.deepEqual(seenRaw, ["Bell Toll", "New Signal"]);
});
