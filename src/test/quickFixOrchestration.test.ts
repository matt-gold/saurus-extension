import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

function readSourceFile(fileName: string): string {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return fs.readFileSync(path.join(repoRoot, "src", fileName), "utf8");
}

test("extension registers code actions instead of completion items", () => {
  const extensionSource = readSourceFile("extension.ts");
  assert.match(extensionSource, /registerCodeActionsProvider/);
  assert.match(extensionSource, /registerCodeLensProvider/);
  assert.equal(extensionSource.includes("registerCompletionItemProvider"), false);
  assert.match(extensionSource, /onDidChangeTextEditorSelection/);
  assert.match(extensionSource, /TextEditorSelectionChangeKind\.Mouse/);
  assert.equal(extensionSource.includes("lastSuggestionKeyByDocument"), false);
  assert.equal(extensionSource.includes("currentKey === previousKey"), false);
});

test("suggestion commands reopen quick fix instead of suggest widget", () => {
  const commandsSource = readSourceFile("commands/registerSaurusCommands.ts");
  assert.match(commandsSource, /editor\.action\.quickFix/);
  assert.match(commandsSource, /showQuickFixDuringGeneration/);
  assert.equal(commandsSource.includes("refreshSuggestWidget"), false);
  assert.equal(commandsSource.includes("showAiOnlySuggestions"), false);
  assert.equal(commandsSource.includes("showThesaurusOnlySuggestions"), false);
});

test("generation service uses notification progress for loading feedback", () => {
  const serviceSource = readSourceFile("app/saurus/internal/SuggestionGenerationService.ts");
  assert.match(serviceSource, /withProgress/);
  assert.match(serviceSource, /ProgressLocation\.Notification/);
  assert.match(serviceSource, /Generating suggestions/);
  assert.equal(serviceSource.includes("loading AI suggestions"), false);
});

test("code action provider auto-starts generation when quick fix opens without suggestions", () => {
  const providerSource = readSourceFile("ui/codeActions/SaurusCodeActionProvider.ts");
  assert.match(providerSource, /maybeAutoGenerateSuggestions/);
  assert.match(providerSource, /!lookup\.hasSuggestions && !lookup\.isGenerating/);
});

test("placeholder code lens reopens quick fix for same-caret clicks", () => {
  const providerSource = readSourceFile("ui/codelens/PlaceholderCodeLensProvider.ts");
  assert.match(providerSource, /CodeLens/);
  assert.match(providerSource, /saurus\.reopenQuickFix/);
  assert.match(providerSource, /Generate Suggestions|Open Saurus/);
});

test("generate with prompt writes prompt metadata back into placeholders", () => {
  const commandsSource = readSourceFile("commands/registerSaurusCommands.ts");
  assert.match(commandsSource, /setPlaceholderPrompt/);
  assert.match(commandsSource, /wrapSelectionInPlaceholderWithPrompt/);
});

test("remove-all-delimiters command delegates to controller", () => {
  const commandsSource = readSourceFile("commands/registerSaurusCommands.ts");
  const controllerSource = readSourceFile("app/saurus/SaurusController.ts");
  const editActionsSource = readSourceFile("app/saurus/internal/PlaceholderEditActions.ts");

  assert.match(commandsSource, /saurus\.removeAllPlaceholderDelimiters/);
  assert.match(controllerSource, /removeAllPlaceholderDelimiters\(editor: vscode\.TextEditor\)/);
  assert.match(editActionsSource, /findAllPlaceholdersInLine/);
  assert.match(editActionsSource, /removeAllPlaceholderDelimiters/);
});

test("placeholder highlighting styles prompt metadata separately", () => {
  const highlightSource = readSourceFile("ui/highlight/PlaceholderHighlighter.ts");
  assert.match(highlightSource, /promptTokenDecoration/);
  assert.match(highlightSource, /promptTextDecoration/);
  assert.match(highlightSource, /parsePlaceholderContent/);
});
