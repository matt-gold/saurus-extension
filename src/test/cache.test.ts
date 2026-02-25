import test from "node:test";
import assert from "node:assert/strict";
import { SuggestionCache } from "../state";

test("clears entries by document uri", () => {
  const cache = new SuggestionCache();

  cache.setEntry("file://a::1", {
    thesaurusOptions: ["one"],
    aiOptions: [],
    thesaurusLastResponseCached: true,
    aiLoadedCount: 0,
    aiLastAddedCount: 0,
    aiLastResponseCached: true,
    seenNormalized: new Set<string>(),
    seenRaw: [],
    createdAt: Date.now(),
    documentVersion: 1,
    documentUri: "file://a",
    lastAccessedAt: Date.now()
  });

  cache.setEntry("file://b::1", {
    thesaurusOptions: ["two"],
    aiOptions: [],
    thesaurusLastResponseCached: true,
    aiLoadedCount: 0,
    aiLastAddedCount: 0,
    aiLastResponseCached: true,
    seenNormalized: new Set<string>(),
    seenRaw: [],
    createdAt: Date.now(),
    documentVersion: 1,
    documentUri: "file://b",
    lastAccessedAt: Date.now()
  });

  cache.clearDocument("file://a");

  assert.equal(cache.hasEntry("file://a::1"), false);
  assert.equal(cache.hasEntry("file://b::1"), true);
});

test("clearAll removes all entries", () => {
  const cache = new SuggestionCache();
  cache.setEntry("file://a::1", {
    thesaurusOptions: ["one"],
    aiOptions: ["two"],
    thesaurusLastResponseCached: false,
    aiLoadedCount: 1,
    aiLastAddedCount: 1,
    aiLastResponseCached: false,
    seenNormalized: new Set<string>(),
    seenRaw: [],
    createdAt: Date.now(),
    documentVersion: 1,
    documentUri: "file://a",
    lastAccessedAt: Date.now()
  });

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
