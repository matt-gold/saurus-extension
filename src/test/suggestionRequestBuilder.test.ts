import test from "node:test";
import assert from "node:assert/strict";
import { SuggestionRequestBuilder } from "../app/saurus/internal/request";
import type { PlaceholderSession } from "../app/saurus/internal/session";
import type { SaurusSettings } from "../types";

function makeSession(directionText = "more exact", targetText = "arrived"): PlaceholderSession {
  return {
    key: "key",
    semanticKey: "semantic",
    documentUri: "file:///scene.md",
    documentVersion: 1,
    match: {
      fullRange: {} as PlaceholderSession["match"]["fullRange"],
      innerRange: {} as PlaceholderSession["match"]["innerRange"],
      rawInnerText: directionText ? `${targetText} :: ${directionText}` : targetText,
      rawFullText: "{{arrived}}",
      open: "{{",
      close: "}}"
    },
    parsedContent: {
      rawTargetText: targetText,
      targetText,
      rawDirectionText: directionText,
      directionText,
      separatorIndex: directionText ? targetText.length + 1 : -1,
      hasPrompt: directionText.length > 0
    },
    contextBefore: "The hero ",
    contextAfter: " before dawn.",
    providerLabel: "Codex",
    configuredModel: "gpt-5",
    entry: {
      suggestions: [],
      loadedCount: 0,
      lastAddedCount: 0,
      lastResponseCached: true,
      seenNormalized: new Set<string>(),
      seenRaw: ["came"],
      createdAt: 0,
      documentVersion: 1,
      documentUri: "file:///scene.md",
      lastAccessedAt: 0
    },
    sourceStates: { ai: "idle" },
    isGenerating: false,
    hasSuggestions: false
  };
}

function makeSettings(): SaurusSettings {
  return {
    enabled: true,
    languages: ["markdown"],
    delimiters: { open: "{{", close: "}}" },
    promptTemplate: "P:${placeholder}|D:${direction}|B:${contextBefore}|A:${contextAfter}|N:${suggestionCount}",
    problemFinderPromptTemplate: "",
    suggestionCount: 5,
    problemFinderMaxIssues: 12,
    contextCharsBefore: 220,
    contextCharsAfter: 140,
    aiProvider: "copilotChat",
    aiPath: "",
    aiModel: "gpt-5",
    aiReasoningEffort: "low",
    aiTimeoutMs: 60000,
    cachePersistAcrossReload: false,
    cachePersistTtlDays: 7
  };
}

test("request builder prefers explicit prompt direction over placeholder metadata", () => {
  const builder = new SuggestionRequestBuilder();
  const built = builder.buildForDocument(
    makeSession("more exact"),
    makeSettings(),
    { fileName: "scene.md", languageId: "markdown" },
    { forceDifferent: true, promptDirection: "less formal", userInitiated: true }
  );

  assert.equal(built.effectiveDirection, "less formal");
  assert.match(built.renderedPrompt, /less formal/);
});

test("request builder falls back to placeholder direction metadata", () => {
  const builder = new SuggestionRequestBuilder();
  const built = builder.buildForDocument(
    makeSession("more exact"),
    makeSettings(),
    { fileName: "scene.md", languageId: "markdown" },
    { forceDifferent: false, userInitiated: true }
  );

  assert.equal(built.effectiveDirection, "more exact");
  assert.deepEqual(built.request.avoidSuggestions, ["came"]);
});

test("request builder rejects empty target text before prompt metadata", () => {
  const builder = new SuggestionRequestBuilder();
  assert.throws(
    () => builder.buildForDocument(
      makeSession("more exact", ""),
      makeSettings(),
      { fileName: "scene.md", languageId: "markdown" },
      { forceDifferent: false, userInitiated: true }
    ),
    /placeholder text cannot be empty/
  );
});
