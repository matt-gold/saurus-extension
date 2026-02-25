import test from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as path from "path";
import { promises as fsp } from "fs";
import {
  deserializeEntry,
  loadPersistedCache,
  pruneExpiredEntries,
  savePersistedCache,
  serializeEntry
} from "../state";
import { SuggestionCacheEntry } from "../types";

function buildEntry(overrides: Partial<SuggestionCacheEntry> = {}): SuggestionCacheEntry {
  return {
    thesaurusOptions: ["one"],
    aiOptions: ["two"],
    thesaurusLastResponseCached: true,
    aiLoadedCount: 1,
    aiLastAddedCount: 1,
    aiLastResponseCached: false,
    seenNormalized: new Set<string>(["two"]),
    seenRaw: ["two"],
    createdAt: 1000,
    documentVersion: 1,
    documentUri: "file://a",
    lastAccessedAt: 1000,
    ...overrides
  };
}

test("serialize/deserialize roundtrip keeps set contents", () => {
  const entry = buildEntry();
  const serialized = serializeEntry(entry);
  const hydrated = deserializeEntry(serialized);

  assert.equal(hydrated.aiLoadedCount, 1);
  assert.equal(hydrated.thesaurusLastResponseCached, true);
  assert.equal(hydrated.aiLastResponseCached, false);
  assert.deepEqual([...hydrated.seenNormalized], ["two"]);
  assert.deepEqual(hydrated.seenRaw, ["two"]);
});

test("pruneExpiredEntries removes stale entries", () => {
  const entries = new Map<string, SuggestionCacheEntry>();
  entries.set("fresh", buildEntry({ lastAccessedAt: 10000 }));
  entries.set("stale", buildEntry({ lastAccessedAt: 10, documentUri: "file://b" }));

  const pruned = pruneExpiredEntries(entries, 5000, 12000);
  assert.equal(pruned.has("fresh"), true);
  assert.equal(pruned.has("stale"), false);
});

test("save/load persisted cache writes and reloads entries", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "saurus-cache-test-"));
  const filePath = path.join(tempDir, "cache.json");
  const entries = new Map<string, SuggestionCacheEntry>();
  entries.set("file://a::1", buildEntry());
  entries.set("file://a::2", buildEntry({ thesaurusOptions: [], aiOptions: [] }));

  await savePersistedCache(filePath, entries);
  const loaded = loadPersistedCache(filePath, 10_000, 2_000);

  assert.equal(loaded.size, 1);
  assert.equal(loaded.has("file://a::1"), true);
  await fsp.rm(tempDir, { recursive: true, force: true });
});
