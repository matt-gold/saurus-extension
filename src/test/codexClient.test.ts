import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexExecArgs, buildCodexLoginStatusArgs } from "../codexClient";

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
