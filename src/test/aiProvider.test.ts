import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AI_PROVIDER,
  getDefaultAiPath,
  sanitizeAiProvider
} from "../aiProvider";

test("default AI provider is copilotChat", () => {
  assert.equal(DEFAULT_AI_PROVIDER, "copilotChat");
});

test("sanitizeAiProvider accepts copilotChat and legacy copilot", () => {
  assert.equal(sanitizeAiProvider("copilotChat"), "copilotChat");
  assert.equal(sanitizeAiProvider("copilot"), "copilot");
  assert.equal(sanitizeAiProvider("COPILOTCHAT"), "copilotChat");
});

test("getDefaultAiPath keeps copilotChat path empty", () => {
  assert.equal(getDefaultAiPath("copilotChat"), "");
  assert.equal(getDefaultAiPath("copilot"), "gh");
  assert.equal(getDefaultAiPath("codex"), "codex");
  assert.equal(getDefaultAiPath("claude"), "claude");
});
