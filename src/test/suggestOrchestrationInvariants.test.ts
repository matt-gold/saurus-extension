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
  assert.match(extensionSource, /from "\.\/suggestWidgetCoordinator"/);
});

test("generate more refresh path uses stabilized suggest refresh helper", () => {
  const commandsSource = readSourceFile("commands.ts");
  const runRefreshWithOptionalDirection = commandsSource.match(
    /const runRefreshWithOptionalDirection = async \([\s\S]*?\n\s+};/
  );
  assert.ok(runRefreshWithOptionalDirection, "Expected runRefreshWithOptionalDirection helper");

  const body = runRefreshWithOptionalDirection[0];
  assert.match(body, /await refreshSuggestWidgetStable\(\);/);
  assert.equal(body.includes("await refreshSuggestWidget({ hard: true, repeat: 2 });"), false);
});

test("suggest widget command strings are owned by coordinator module", () => {
  const coordinatorSource = readSourceFile("suggestWidgetCoordinator.ts");
  assert.match(coordinatorSource, /"editor\.action\.triggerSuggest"/);
  assert.match(coordinatorSource, /"hideSuggestWidget"/);
});
