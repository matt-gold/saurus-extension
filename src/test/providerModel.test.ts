import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderItems, BuildProviderItemsInput } from "../providerModel";

function makeInput(overrides: Partial<BuildProviderItemsInput> = {}): BuildProviderItemsInput {
  return {
    sourceStates: { thesaurus: "idle", ai: "idle" },
    sourceFilter: "all",
    hasEntry: false,
    thesaurusOptions: [],
    aiOptions: [],
    thesaurusCached: false,
    aiCached: false,
    aiLoadedCount: 0,
    aiLastAddedCount: 0,
    aiLastResponseCached: true,
    aiProviderName: "Codex",
    thesaurusProvider: "merriamWebster",
    thesaurusPrefix: "📖",
    aiPrefix: "✨",
    placeholderRawText: "{{word}}",
    aiAutoRun: false,
    ...overrides
  };
}

test("shows heading and AI actions when no entry and all sources idle", () => {
  const items = buildProviderItems(makeInput());
  assert.equal(items[0]?.kind, "heading");
  assert.equal(items.some((item) => item.kind === "refresh"), true);
  assert.equal(items.some((item) => item.kind === "refreshWithPrompt"), true);
  assert.equal(items.some((item) => item.kind === "empty"), false);
});

test("renders heading row and prefixed source suggestions", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["lucid", "clear"],
    aiOptions: ["pellucid phrase"],
    thesaurusCached: true,
    aiCached: false,
    aiLoadedCount: 12,
    aiLastAddedCount: 4,
    aiLastResponseCached: false,
    aiAutoRun: true
  }));

  assert.equal(items[0].kind, "heading");
  assert.equal(items[0].label, "🦖  (Select a replacement below)");
  assert.equal(items[0].detail, "[Esc] to exit");
  assert.equal(items[1].label, "📖 1  lucid");
  assert.equal(items[2].label, "📖 2  clear");

  assert.equal(items[3].label, "✨ 1  pellucid phrase");
  assert.equal(items[3].detail, "From Codex");

  assert.equal(items.at(-2)?.kind, "refresh");
  assert.equal(items.at(-2)?.label, "↻ Generate more");
  assert.equal(items.at(-2)?.detail, "with Codex");
  assert.equal(items.at(-2)?.disabled, false);
  assert.equal(items.at(-1)?.kind, "refreshWithPrompt");
  assert.equal(items.at(-1)?.label, "↻ Generate w/ prompt");
  assert.equal(items.at(-1)?.detail, "with Codex");
  assert.equal(items.at(-1)?.disabled, false);
});

test("does not render source header rows", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "idle" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    thesaurusCached: true,
    aiAutoRun: false
  }));

  assert.equal(items.some((item) => item.label.includes("--- Thesaurus ---")), false);
  assert.equal(items.some((item) => item.label.includes("--- AI ---")), false);
  assert.equal(items.some((item) => item.kind === "empty" && item.source === "ai"), false);
});

test("shows thesaurus loading row while fetching", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "generating", ai: "idle" },
    thesaurusCached: false,
    hasEntry: true
  }));

  const loading = items.find((item) => item.kind === "loading" && item.source === "thesaurus");
  assert.ok(loading);
  assert.match(loading?.label ?? "", /📖/);
  assert.match(loading?.detail ?? "", /From Merriam-Webster API • fetching now/);
});

test("shows loading spinner only for refresh action when refresh is active", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "generating" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["still", "calm"],
    thesaurusCached: true,
    aiCached: true,
    aiLoadedCount: 20,
    aiLastAddedCount: 10,
    aiLastResponseCached: false,
    aiActiveAction: "refresh"
  }));

  const aiLoading = items.find((item) => item.kind === "loading" && item.source === "ai");
  assert.ok(aiLoading);

  const refresh = items.find((item) => item.kind === "refresh");
  assert.ok(refresh);
  assert.equal(refresh?.label, "$(loading~spin) Getting more AI options...");
  assert.equal(refresh?.disabled, true);

  const withPrompt = items.find((item) => item.kind === "refreshWithPrompt");
  assert.ok(withPrompt);
  assert.equal(withPrompt?.label, "↻ Generate w/ prompt");
  assert.equal(withPrompt?.disabled, true);
});

test("shows loading spinner only for prompt action when prompt refresh is active", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "generating" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["still", "calm"],
    thesaurusCached: true,
    aiCached: true,
    aiLoadedCount: 20,
    aiLastAddedCount: 10,
    aiLastResponseCached: false,
    aiActiveAction: "refreshWithPrompt"
  }));

  const refresh = items.find((item) => item.kind === "refresh");
  assert.ok(refresh);
  assert.equal(refresh?.label, "↻ Generate more");
  assert.equal(refresh?.disabled, true);

  const withPrompt = items.find((item) => item.kind === "refreshWithPrompt");
  assert.ok(withPrompt);
  assert.equal(withPrompt?.label, "$(loading~spin) Generating with prompt...");
  assert.equal(withPrompt?.disabled, true);
});

test("formats ai detail as only new when no cached results yet", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    aiCached: false,
    aiLoadedCount: 10,
    aiLastAddedCount: 10,
    aiLastResponseCached: false
  }));

  const aiSuggestion = items.find((item) => item.kind === "suggestion" && item.source === "ai");
  assert.ok(aiSuggestion);
  assert.equal(aiSuggestion?.detail, "From Codex");
  assert.match(aiSuggestion?.label ?? "", /^✨ /);
});

test("formats ai detail as cache when result came from cache", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: Array.from({ length: 20 }, (_, i) => `opt-${i}`),
    aiCached: true,
    aiLoadedCount: 20,
    aiLastAddedCount: 0,
    aiLastResponseCached: true
  }));

  const aiSuggestion = items.find((item) => item.kind === "suggestion" && item.source === "ai");
  assert.ok(aiSuggestion);
  assert.equal(aiSuggestion?.detail, "From Codex cache");
});

test("filters to ai-only and hides thesaurus rows", () => {
  const items = buildProviderItems(makeInput({
    sourceFilter: "aiOnly",
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clearer phrase"],
    aiCached: false
  }));

  assert.equal(items.some((item) => item.source === "thesaurus"), false);
  assert.equal(items.some((item) => item.kind === "refresh"), true);
  assert.equal(items.some((item) => item.kind === "refreshWithPrompt"), true);
});

test("filters to thesaurus-only and hides ai rows", () => {
  const items = buildProviderItems(makeInput({
    sourceFilter: "thesaurusOnly",
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clearer phrase"],
    thesaurusCached: false
  }));

  assert.equal(items.some((item) => item.source === "ai"), false);
  assert.equal(items.some((item) => item.kind === "refresh"), false);
  assert.equal(items.some((item) => item.kind === "refreshWithPrompt"), false);
  const thesaurusSuggestion = items.find((item) => item.kind === "suggestion" && item.source === "thesaurus");
  assert.equal(thesaurusSuggestion?.detail, "From Merriam-Webster API");
});

test("uses configured source prefixes for labels", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "ready" },
    sourceFilter: "all",
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clear"],
    thesaurusPrefix: "T:",
    aiPrefix: "A:"
  }));

  const thesaurusSuggestion = items.find((item) => item.kind === "suggestion" && item.source === "thesaurus");
  const aiSuggestion = items.find((item) => item.kind === "suggestion" && item.source === "ai");
  assert.equal(thesaurusSuggestion?.label, "T: 1  quiet");
  assert.equal(aiSuggestion?.label, "A: 1  clear");
});

test("uses configured AI provider name in detail text", () => {
  const items = buildProviderItems(makeInput({
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["clear"],
    aiProviderName: "Copilot Chat",
    aiCached: false
  }));

  const aiSuggestion = items.find((item) => item.kind === "suggestion" && item.source === "ai");
  const refresh = items.find((item) => item.kind === "refresh");
  const refreshWithPrompt = items.find((item) => item.kind === "refreshWithPrompt");
  assert.equal(aiSuggestion?.detail, "From Copilot Chat");
  assert.equal(refresh?.detail, "with Copilot Chat");
  assert.equal(refreshWithPrompt?.detail, "with Copilot Chat");
});
