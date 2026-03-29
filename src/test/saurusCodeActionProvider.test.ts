import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");

function readSource(fileName: string): string {
  return fs.readFileSync(path.join(repoRoot, "src", fileName), "utf8");
}

test("provider maps suggestion and generation actions to command ids", () => {
  const source = readSource("ui/codeActions/SaurusCodeActionProvider.ts");

  assert.match(source, /command:\s*"saurus\.applySuggestion"/);
  assert.match(source, /command:\s*lookup\.hasSuggestions \? "saurus\.refreshSuggestions" : "saurus\.generateSuggestions"/);
  assert.match(source, /command:\s*"saurus\.refreshSuggestionsWithPrompt"/);
});

test("provider exposes Quick Fix actions only", () => {
  const source = readSource("ui/codeActions/SaurusCodeActionProvider.ts");

  assert.match(source, /providedCodeActionKinds = \[vscode\.CodeActionKind\.QuickFix\]/);
  assert.match(source, /getSuggestionActionLookup/);
});
