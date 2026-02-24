import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiSemanticCacheKey,
  buildThesaurusSemanticCacheKey,
  normalizeAiAdjacentContext
} from "../core/suggestions";

test("thesaurus semantic key is shared for same term and provider", () => {
  const a = buildThesaurusSemanticCacheKey({
    provider: "merriamWebster",
    rawPlaceholder: "bird"
  });

  const b = buildThesaurusSemanticCacheKey({
    provider: "merriamWebster",
    rawPlaceholder: "  BIRD  "
  });

  assert.equal(a, b);
});

test("thesaurus semantic key changes when lookup term changes", () => {
  const bird = buildThesaurusSemanticCacheKey({
    provider: "merriamWebster",
    rawPlaceholder: "bird"
  });
  const hawk = buildThesaurusSemanticCacheKey({
    provider: "merriamWebster",
    rawPlaceholder: "hawk"
  });

  assert.notEqual(bird, hawk);
});

function makeAiKey(overrides: Partial<Parameters<typeof buildAiSemanticCacheKey>[0]> = {}): string {
  return buildAiSemanticCacheKey({
    placeholder: "bird",
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

test("ai semantic key is shared when placeholder/context/provider/model are identical", () => {
  const first = makeAiKey();
  const second = makeAiKey();

  assert.equal(first, second);
});

test("ai semantic key changes when context changes", () => {
  const base = makeAiKey();
  const changedLeft = makeAiKey({ contextBefore: "A " });
  const changedRight = makeAiKey({ contextAfter: " perched nearby." });

  assert.notEqual(base, changedLeft);
  assert.notEqual(base, changedRight);
});

test("ai semantic key changes when provider or model changes", () => {
  const base = makeAiKey();
  const providerChanged = makeAiKey({ aiProvider: "codex", aiPath: "codex" });
  const modelChanged = makeAiKey({ aiModel: "gpt-5-codex" });

  assert.notEqual(base, providerChanged);
  assert.notEqual(base, modelChanged);
});

test("normalizeAiAdjacentContext strips placeholder delimiters but keeps inner text", () => {
  const normalizedBefore = normalizeAiAdjacentContext("Alpha {{nearby}} ", { open: "{{", close: "}}" });
  const normalizedAfter = normalizeAiAdjacentContext(" and [[other]] Beta", { open: "[[", close: "]]" });

  assert.equal(normalizedBefore, "Alpha nearby ");
  assert.equal(normalizedAfter, " and other Beta");
});

test("ai semantic key can ignore nearby placeholder delimiters after normalization", () => {
  const withWrappedNeighbor = buildAiSemanticCacheKey({
    placeholder: "bird",
    contextBefore: normalizeAiAdjacentContext("The {{swift}} ", { open: "{{", close: "}}" }),
    contextAfter: normalizeAiAdjacentContext(" flew past the {{tree}}.", { open: "{{", close: "}}" }),
    aiProvider: "copilotChat",
    aiPath: "",
    aiModel: "",
    aiReasoningEffort: "medium",
    promptTemplateHash: "prompt-v1"
  });

  const withoutWrappedNeighbor = buildAiSemanticCacheKey({
    placeholder: "bird",
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
