import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

function readSourceFile(fileName: string): string {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return fs.readFileSync(path.join(repoRoot, "src", fileName), "utf8");
}

test("suggestion result store owns semantic cache and persistence behavior", () => {
  const source = readSourceFile("app/saurus/internal/store/SuggestionResultStore.ts");
  assert.match(source, /semanticSuggestionCache/);
  assert.match(source, /loadPersistedCache/);
  assert.match(source, /savePersistedCache/);
  assert.match(source, /runExclusive/);
  assert.match(source, /markGenerating/);
  assert.match(source, /markReady/);
  assert.match(source, /markError/);
});

test("extension composes session factory, request builder, and result store", () => {
  const source = readSourceFile("extension.ts");
  assert.match(source, /createPlaceholderSessionFactory/);
  assert.match(source, /createSuggestionRequestBuilder/);
  assert.match(source, /createSuggestionResultStore/);
  assert.equal(source.includes("createPersistentCacheCoordinator"), false);
});
