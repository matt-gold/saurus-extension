import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

function readSourceFile(fileName: string): string {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return fs.readFileSync(path.join(repoRoot, "src", fileName), "utf8");
}

test("extension auto-trigger path does not directly hide suggest widget", () => {
  const extensionSource = readSourceFile("extension.ts");
  assert.equal(extensionSource.includes("\"hideSuggestWidget\""), false);
  assert.equal(extensionSource.includes("\"editor.action.triggerSuggest\""), false);
  assert.match(extensionSource, /from "\.\/ui\/suggest"/);
});

test("generate more refresh path uses stabilized suggest refresh helper", () => {
  const commandsSource = readSourceFile("commands/registerSaurusCommands.ts");
  const runRefreshWithOptionalDirection = commandsSource.match(
    /const runRefreshWithOptionalDirection = async \([\s\S]*?\n\s+};/
  );
  assert.ok(runRefreshWithOptionalDirection, "Expected runRefreshWithOptionalDirection helper");

  const body = runRefreshWithOptionalDirection[0];
  assert.match(body, /await refreshSuggestWidgetStable\(\);/);
  assert.equal(body.includes("await refreshSuggestWidget({ hard: true, repeat: 2 });"), false);
});

test("suggest widget command strings are owned by coordinator module", () => {
  const coordinatorSource = readSourceFile("ui/suggest/suggestWidgetCoordinator.ts");
  assert.match(coordinatorSource, /"editor\.action\.triggerSuggest"/);
  assert.match(coordinatorSource, /"hideSuggestWidget"/);
});

test("async source completion refresh path is shared across thesaurus and AI", () => {
  const generationSource = readSourceFile("app/saurus/internal/SuggestionGenerationService.ts");
  assert.match(generationSource, /private setSourceSettledStateAndRefreshPopover\(/);
  assert.match(generationSource, /setSourceSettledStateAndRefreshPopover\(suggestionKey, "thesaurus", "ready"/);
  assert.match(generationSource, /setSourceSettledStateAndRefreshPopover\(suggestionKey, "thesaurus", "error"/);
  assert.match(generationSource, /setSourceSettledStateAndRefreshPopover\(suggestionKey, "ai", "ready"/);
  assert.equal(generationSource.includes("if (needsAi) {\n              void triggerSuggestWidget();"), false);
});
