import test from "node:test";
import assert from "node:assert/strict";
import { SuggestionCache } from "../state";

function buildEntry(documentUri: string, suggestions: string[] = []): Parameters<SuggestionCache["setEntry"]>[1] {
  return {
    suggestions,
    loadedCount: suggestions.length,
    lastAddedCount: suggestions.length,
    lastResponseCached: suggestions.length === 0,
    seenNormalized: new Set<string>(),
    seenRaw: [],
    createdAt: Date.now(),
    documentVersion: 1,
    documentUri,
    lastAccessedAt: Date.now()
  };
}

test("clears entries by document uri", () => {
  const cache = new SuggestionCache();

  cache.setEntry("file://a::1", buildEntry("file://a", ["one"]));
  cache.setEntry("file://b::1", buildEntry("file://b", ["two"]));

  cache.clearDocument("file://a");

  assert.equal(cache.hasEntry("file://a::1"), false);
  assert.equal(cache.hasEntry("file://b::1"), true);
});

test("clearAll removes all entries", () => {
  const cache = new SuggestionCache();
  cache.setEntry("file://a::1", buildEntry("file://a", ["two"]));

  cache.clearAll();
  assert.equal(cache.hasEntry("file://a::1"), false);
});

test("runExclusive deduplicates concurrent work", async () => {
  const cache = new SuggestionCache();
  let calls = 0;

  const run = async (): Promise<number> => {
    calls += 1;
    return 42;
  };

  const [a, b] = await Promise.all([
    cache.runExclusive("key", run),
    cache.runExclusive("key", run)
  ]);

  assert.equal(a, 42);
  assert.equal(b, 42);
  assert.equal(calls, 1);
});
