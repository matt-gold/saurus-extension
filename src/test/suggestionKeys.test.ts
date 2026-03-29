import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSuggestionSemanticCacheKey,
  normalizeAiAdjacentContext
} from "../core/suggestions";

function makeSuggestionKey(overrides: Partial<Parameters<typeof buildSuggestionSemanticCacheKey>[0]> = {}): string {
  return buildSuggestionSemanticCacheKey({
    placeholder: "bird",
    direction: "",
    contextBefore: "The ",
    contextAfter: " flew south.",
    aiProvider: "copilotChat",
    aiPath: "",
    aiModel: "",
    aiReasoningEffort: "medium",
    promptTemplateHash: "prompt-v1",
    ...overrides
  });
}

test("suggestion semantic key is shared when placeholder/context/provider/model are identical", () => {
  const first = makeSuggestionKey();
  const second = makeSuggestionKey();

  assert.equal(first, second);
});

test("suggestion semantic key changes when context changes", () => {
  const base = makeSuggestionKey();
  const changedLeft = makeSuggestionKey({ contextBefore: "A " });
  const changedRight = makeSuggestionKey({ contextAfter: " perched nearby." });

  assert.notEqual(base, changedLeft);
  assert.notEqual(base, changedRight);
});

test("suggestion semantic key changes when provider or model changes", () => {
  const base = makeSuggestionKey();
  const providerChanged = makeSuggestionKey({ aiProvider: "codex", aiPath: "codex" });
  const modelChanged = makeSuggestionKey({ aiModel: "gpt-5-codex" });

  assert.notEqual(base, providerChanged);
  assert.notEqual(base, modelChanged);
});

test("normalizeAiAdjacentContext strips placeholder delimiters but keeps inner text", () => {
  const normalizedBefore = normalizeAiAdjacentContext("Alpha {{nearby}} ", { open: "{{", close: "}}" });
  const normalizedAfter = normalizeAiAdjacentContext(" and [[other]] Beta", { open: "[[", close: "]]" });

  assert.equal(normalizedBefore, "Alpha nearby ");
  assert.equal(normalizedAfter, " and other Beta");
});

test("suggestion semantic key can ignore nearby placeholder delimiters after normalization", () => {
  const withWrappedNeighbor = buildSuggestionSemanticCacheKey({
    placeholder: "bird",
    direction: "",
    contextBefore: normalizeAiAdjacentContext("The {{swift}} ", { open: "{{", close: "}}" }),
    contextAfter: normalizeAiAdjacentContext(" flew past the {{tree}}.", { open: "{{", close: "}}" }),
    aiProvider: "copilotChat",
    aiPath: "",
    aiModel: "",
    aiReasoningEffort: "medium",
    promptTemplateHash: "prompt-v1"
  });

  const withoutWrappedNeighbor = buildSuggestionSemanticCacheKey({
    placeholder: "bird",
    direction: "",
    contextBefore: "The swift ",
    contextAfter: " flew past the tree.",
    aiProvider: "copilotChat",
    aiPath: "",
    aiModel: "",
    aiReasoningEffort: "medium",
    promptTemplateHash: "prompt-v1"
  });

  assert.equal(withWrappedNeighbor, withoutWrappedNeighbor);
});

test("suggestion semantic key changes when prompt metadata changes", () => {
  const base = makeSuggestionKey();
  const prompted = makeSuggestionKey({ direction: "more exact" });

  assert.notEqual(base, prompted);
});
