import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  appendDirectionGuidance,
  formatAvoidSuggestions,
  renderPromptTemplate
} from "../core/suggestions";

function readSettingsSource(): string {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return fs.readFileSync(path.join(repoRoot, "src", "config", "settings.ts"), "utf8");
}

test("renders prompt variables", () => {
  const template = "A:${placeholder}|B:${contextBefore}|C:${contextAfter}|N:${suggestionCount}|X:${avoidSuggestions}";
  const rendered = renderPromptTemplate(template, {
    placeholder: "quiet bell",
    contextBefore: "before",
    contextAfter: "after",
    suggestionCount: 4,
    avoidSuggestions: ["one", "two"],
    direction: "more dreamlike",
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

test("appends custom direction guidance to prompt", () => {
  const prompt = appendDirectionGuidance("Base prompt", "more dreamlike");
  assert.match(prompt, /Additional direction for this run:/);
  assert.match(prompt, /more dreamlike/);
});

test("does not append guidance when direction is empty", () => {
  const prompt = appendDirectionGuidance("Base prompt", "  ");
  assert.equal(prompt, "Base prompt");
});

test("default prompt does not bias toward single-word replacements", () => {
  const source = readSettingsSource();
  assert.equal(source.includes("Prefer single-word replacements"), false);
  assert.equal(source.includes("multiple single-word options"), false);
});
