import test from "node:test";
import assert from "node:assert/strict";
import {
  AiAuthError,
  buildAiEnvOverrides,
  buildAiExecArgs,
  buildAiLoginStatusArgs,
  getAiProviderLabel
} from "../services/ai/cliAiClient";

test("buildAiExecArgs includes codex schema output flags", () => {
  const args = buildAiExecArgs(
    {
      aiProvider: "codex",
      aiPath: "codex",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      model: "gpt-5.3-codex",
      reasoningEffort: "low"
    },
    "/tmp/out.json",
    "hello"
  );

  assert.deepEqual(args.slice(0, 5), ["exec", "--ephemeral", "--skip-git-repo-check", "-C", "/tmp/workspace"]);
  assert.ok(args.includes("--output-schema"));
  assert.ok(args.includes("--output-last-message"));
  assert.ok(args.includes("--model"));
  assert.equal(args.at(-1), "-");
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

test("buildAiExecArgs omits --model when model is empty", () => {
  const codexArgs = buildAiExecArgs(
    {
      aiProvider: "codex",
      aiPath: "codex",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      model: "   "
    },
    "/tmp/out.json",
    "hello"
  );
  assert.equal(codexArgs.includes("--model"), false);

  const claudeArgs = buildAiExecArgs(
    {
      aiProvider: "claude",
      aiPath: "claude",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json"
    },
    "/tmp/out.json",
    "hello"
  );
  assert.deepEqual(claudeArgs, ["-p", "hello"]);

  const copilotArgs = buildAiExecArgs(
    {
      aiProvider: "copilot",
      aiPath: "gh",
      timeoutMs: 20000,
      workspaceDir: "/tmp/workspace",
      schemaPath: "/tmp/schema.json",
      model: ""
    },
    "/tmp/out.json",
    "hello"
  );
  assert.deepEqual(copilotArgs, ["copilot", "--", "-s", "-p", "hello"]);
});

test("buildAiLoginStatusArgs only applies to codex", () => {
  assert.deepEqual(buildAiLoginStatusArgs("codex", "codex"), ["login", "status"]);
  assert.deepEqual(buildAiLoginStatusArgs("copilot", "gh"), ["auth", "status"]);
  assert.equal(buildAiLoginStatusArgs("claude"), undefined);
  assert.equal(buildAiLoginStatusArgs("copilot", "copilot"), undefined);
});

test("getAiProviderLabel maps providers to display names", () => {
  assert.equal(getAiProviderLabel("codex"), "Codex");
  assert.equal(getAiProviderLabel("copilot"), "Copilot CLI");
  assert.equal(getAiProviderLabel("copilotChat"), "Copilot Chat");
  assert.equal(getAiProviderLabel("claude"), "Claude");
});

test("AiAuthError gives provider-specific guidance for claude", () => {
  const error = new AiAuthError("claude");
  assert.match(error.message, /ANTHROPIC_API_KEY/);
});

test("buildAiEnvOverrides maps reasoning effort for claude", () => {
  assert.deepEqual(
    buildAiEnvOverrides({ aiProvider: "claude", reasoningEffort: "low" }),
    { CLAUDE_CODE_EFFORT_LEVEL: "low" }
  );
  assert.deepEqual(
    buildAiEnvOverrides({ aiProvider: "claude", reasoningEffort: "medium" }),
    { CLAUDE_CODE_EFFORT_LEVEL: "medium" }
  );
  assert.deepEqual(
    buildAiEnvOverrides({ aiProvider: "claude", reasoningEffort: "high" }),
    { CLAUDE_CODE_EFFORT_LEVEL: "high" }
  );
  assert.deepEqual(
    buildAiEnvOverrides({ aiProvider: "claude", reasoningEffort: "xhigh" }),
    { CLAUDE_CODE_EFFORT_LEVEL: "high" }
  );
  assert.deepEqual(
    buildAiEnvOverrides({ aiProvider: "claude", reasoningEffort: "none" }),
    { MAX_THINKING_TOKENS: "0" }
  );
});

test("buildAiEnvOverrides is undefined for non-claude providers", () => {
  assert.equal(buildAiEnvOverrides({ aiProvider: "codex", reasoningEffort: "high" }), undefined);
  assert.equal(buildAiEnvOverrides({ aiProvider: "copilot", reasoningEffort: "high" }), undefined);
});
