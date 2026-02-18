import test from "node:test";
import assert from "node:assert/strict";
import {
  AiAuthError,
  buildAiExecArgs,
  buildAiLoginStatusArgs,
  buildCodexExecArgs,
  buildCodexLoginStatusArgs,
  getAiProviderLabel
} from "../codexClient";

test("buildCodexExecArgs includes required flags", () => {
  const args = buildCodexExecArgs(
    {
      codexPath: "codex",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json"
    },
    "/tmp/out.json"
  );

  assert.deepEqual(args.slice(0, 5), ["exec", "--ephemeral", "--skip-git-repo-check", "-C", "/tmp/workspace"]);
  assert.ok(args.includes("--output-schema"));
  assert.ok(args.includes("--output-last-message"));
  assert.equal(args.at(-1), "-");
});

test("buildCodexExecArgs includes model when set", () => {
  const args = buildCodexExecArgs(
    {
      codexPath: "codex",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      model: "gpt-5"
    },
    "/tmp/out.json"
  );

  assert.ok(args.includes("--model"));
  assert.ok(args.includes("gpt-5"));
});

test("buildCodexExecArgs includes reasoning effort override when set", () => {
  const args = buildCodexExecArgs(
    {
      codexPath: "codex",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      reasoningEffort: "low"
    },
    "/tmp/out.json"
  );

  const configIndex = args.indexOf("-c");
  assert.notEqual(configIndex, -1);
  assert.equal(args[configIndex + 1], 'model_reasoning_effort="low"');
});

test("buildCodexLoginStatusArgs is stable", () => {
  assert.deepEqual(buildCodexLoginStatusArgs(), ["login", "status"]);
});

test("buildAiExecArgs includes provider-specific args for claude", () => {
  const args = buildAiExecArgs(
    {
      aiProvider: "claude",
      aiPath: "claude",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      model: "claude-3-7-sonnet"
    },
    "/tmp/out.json",
    "hello"
  );

  assert.deepEqual(args.slice(0, 2), ["--model", "claude-3-7-sonnet"]);
  assert.deepEqual(args.slice(2), ["-p", "hello"]);
});

test("buildAiExecArgs supports copilot via gh wrapper", () => {
  const args = buildAiExecArgs(
    {
      aiProvider: "copilot",
      aiPath: "gh",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      model: "gpt-5-mini"
    },
    "/tmp/out.json",
    "hello"
  );

  assert.deepEqual(args, ["copilot", "--", "--model", "gpt-5-mini", "-s", "-p", "hello"]);
});

test("buildAiExecArgs supports direct copilot binary", () => {
  const args = buildAiExecArgs(
    {
      aiProvider: "copilot",
      aiPath: "copilot",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json"
    },
    "/tmp/out.json",
    "hello"
  );

  assert.deepEqual(args, ["-s", "-p", "hello"]);
});

test("buildAiLoginStatusArgs only applies to codex", () => {
  assert.deepEqual(buildAiLoginStatusArgs("codex", "codex"), ["login", "status"]);
  assert.deepEqual(buildAiLoginStatusArgs("copilot", "gh"), ["auth", "status"]);
  assert.equal(buildAiLoginStatusArgs("claude"), undefined);
  assert.equal(buildAiLoginStatusArgs("copilot", "copilot"), undefined);
});

test("getAiProviderLabel maps providers to display names", () => {
  assert.equal(getAiProviderLabel("codex"), "Codex");
  assert.equal(getAiProviderLabel("copilot"), "Copilot");
  assert.equal(getAiProviderLabel("claude"), "Claude");
});

test("AiAuthError gives provider-specific guidance for claude", () => {
  const error = new AiAuthError("claude");
  assert.match(error.message, /ANTHROPIC_API_KEY/);
});
