import test from "node:test";
import assert from "node:assert/strict";
import { buildCodeActions } from "../ui/codeActions/internal/buildCodeActions";
import { SuggestionActionLookup } from "../types";

function makeLookup(overrides: Partial<SuggestionActionLookup> = {}): SuggestionActionLookup {
  return {
    key: "doc::key",
    match: {
      fullRange: {} as SuggestionActionLookup["match"]["fullRange"],
      innerRange: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 6 }
      } as SuggestionActionLookup["match"]["innerRange"],
      rawInnerText: "word",
      rawFullText: "{{word}}",
      open: "{{",
      close: "}}"
    },
    entry: undefined,
    sourceStates: { ai: "idle" },
    aiProviderName: "Codex",
    aiConfiguredModel: "gpt-5",
    isGenerating: false,
    hasSuggestions: false,
    ...overrides
  };
}

test("placeholder with no suggestions returns generate actions", () => {
  const items = buildCodeActions(makeLookup());
  assert.deepEqual(
    items.map((item) => item.kind),
    ["generate", "generateWithPrompt"]
  );
  assert.equal(items[0]?.title, "Saurus: Generate Suggestions");
});

test("placeholder with suggestions returns replacements and refresh actions", () => {
  const items = buildCodeActions(makeLookup({
    entry: {
      suggestions: ["arrived", "came", "appeared"],
      loadedCount: 3,
      lastAddedCount: 3,
      lastResponseCached: false,
      seenNormalized: new Set<string>(),
      seenRaw: [],
      createdAt: 0,
      documentVersion: 1,
      documentUri: "file:///test.md",
      lastAccessedAt: 0
    },
    hasSuggestions: true
  }));

  assert.deepEqual(
    items.map((item) => item.kind),
    ["suggestion", "suggestion", "suggestion", "generate", "generateWithPrompt"]
  );
  assert.equal(items[0]?.title, "arrived");
  assert.equal(items[3]?.title, "Saurus: Generate More");
});

test("generation in progress returns loading action only", () => {
  const items = buildCodeActions(makeLookup({
    isGenerating: true
  }));

  assert.deepEqual(items, [{ kind: "loading", title: "Saurus: Generating suggestions..." }]);
});
