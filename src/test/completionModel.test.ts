import test from "node:test";
import assert from "node:assert/strict";
import { buildCompletionSuggestions, BuildCompletionSuggestionsInput } from "../completionModel";

function makeInput(overrides: Partial<BuildCompletionSuggestionsInput> = {}): BuildCompletionSuggestionsInput {
  return {
    sourceFilter: "all",
    hasEntry: false,
    thesaurusOptions: [],
    aiOptions: [],
    thesaurusCached: false,
    aiCached: false,
    aiProviderName: "Codex",
    thesaurusProvider: "merriamWebster",
    thesaurusPrefix: "📖",
    aiPrefix: "✨",
    ...overrides
  };
}

test("returns empty when no entry", () => {
  const items = buildCompletionSuggestions(makeInput());
  assert.equal(items.length, 0);
});

test("orders thesaurus suggestions before ai suggestions", () => {
  const items = buildCompletionSuggestions(makeInput({
    hasEntry: true,
    thesaurusOptions: ["lucid", "clear"],
    aiOptions: ["pellucid phrase"],
    thesaurusCached: true,
    aiCached: false
  }));

  assert.deepEqual(items.map((item) => item.id), [
    "suggestion:thesaurus:0",
    "suggestion:thesaurus:1",
    "suggestion:ai:0"
  ]);
  assert.equal(items[0].label, "📖 1  lucid");
  assert.equal(items[1].label, "📖 2  clear");
  assert.equal(items[2].label, "✨ 1  pellucid phrase");
});

test("uses cache-aware detail text", () => {
  const items = buildCompletionSuggestions(makeInput({
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clear"],
    thesaurusCached: false,
    aiCached: true,
    aiProviderName: "Copilot Chat"
  }));

  assert.equal(items[0].detail, "From Merriam-Webster API");
  assert.equal(items[1].detail, "From Copilot Chat cache");
});

test("filters to ai-only", () => {
  const items = buildCompletionSuggestions(makeInput({
    sourceFilter: "aiOnly",
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clear"]
  }));

  assert.deepEqual(items.map((item) => item.id), ["suggestion:ai:0"]);
});

test("filters to thesaurus-only", () => {
  const items = buildCompletionSuggestions(makeInput({
    sourceFilter: "thesaurusOnly",
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clear"]
  }));

  assert.deepEqual(items.map((item) => item.id), ["suggestion:thesaurus:0"]);
});

test("returns empty when sources have no suggestions", () => {
  const items = buildCompletionSuggestions(makeInput({
    hasEntry: true,
    thesaurusOptions: [],
    aiOptions: []
  }));

  assert.equal(items.length, 0);
});
