import test from "node:test";
import assert from "node:assert/strict";
import { formatAvoidSuggestions, renderPromptTemplate } from "../prompt";

test("renders prompt variables", () => {
  const template = "A:${placeholder}|B:${contextBefore}|C:${contextAfter}|N:${suggestionCount}|X:${avoidSuggestions}";
  const rendered = renderPromptTemplate(template, {
    placeholder: "quiet bell",
    contextBefore: "before",
    contextAfter: "after",
    suggestionCount: 4,
    avoidSuggestions: ["one", "two"],
    fileName: "scene.md",
    languageId: "markdown"
  });

  assert.match(rendered, /A:quiet bell/);
  assert.match(rendered, /N:4/);
  assert.match(rendered, /- one/);
});

test("formatAvoidSuggestions returns none marker", () => {
  assert.equal(formatAvoidSuggestions([]), "(none)");
});
