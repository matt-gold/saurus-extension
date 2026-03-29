import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

function readSourceFile(fileName: string): string {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return fs.readFileSync(path.join(repoRoot, "src", fileName), "utf8");
}

test("placeholder session factory resolves parsed placeholder state and semantic keys", () => {
  const source = readSourceFile("app/saurus/internal/session/PlaceholderSessionFactory.ts");
  assert.match(source, /parsePlaceholderContent/);
  assert.match(source, /buildSuggestionSemanticCacheKey/);
  assert.match(source, /const contextBefore = normalizeAiAdjacentContext/);
  assert.match(source, /const contextAfter = normalizeAiAdjacentContext/);
  assert.match(source, /contextBefore,\s*contextAfter,\s*open:/s);
  assert.match(source, /hydrateFromSemanticCache/);
  assert.match(source, /hasSuggestions: suggestions.length > 0/);
});

test("controller delegates session lookup to the placeholder session factory", () => {
  const source = readSourceFile("app/saurus/SaurusController.ts");
  assert.match(source, /getSessionAtPosition/);
  assert.match(source, /this\.placeholderSessionFactory\.getSession/);
  assert.equal(source.includes("buildSuggestionKeyData"), false);
  assert.equal(source.includes("hydrateUiEntryFromSemanticCaches"), false);
});
