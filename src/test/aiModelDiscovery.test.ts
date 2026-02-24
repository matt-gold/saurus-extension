import test from "node:test";
import assert from "node:assert/strict";
import {
  CLAUDE_CLI_FALLBACK_MODELS,
  CODEX_CLI_FALLBACK_MODELS,
  discoverCliModels,
  getCliModelDiscoveryCommand,
  parseCodexModelsCache,
  parseModelChoicesFromHelp
} from "../services/ai/aiModelDiscovery";

test("parses quoted model choices from wrapped help output", () => {
  const helpText = `
    --model <model>   Set the AI model to use (choices:
                      "gpt-5.3-codex", "gpt-5.2",
                      "gpt-4.1")
  `;

  assert.deepEqual(parseModelChoicesFromHelp(helpText), ["gpt-5.3-codex", "gpt-5.2", "gpt-4.1"]);
});

test("returns empty when help output has no model choices", () => {
  const helpText = `
    -m, --model <MODEL>
      Model the agent should use
  `;

  assert.deepEqual(parseModelChoicesFromHelp(helpText), []);
});

test("uses gh wrapper discovery invocation for copilot provider", () => {
  const invocation = getCliModelDiscoveryCommand("copilot", "gh");
  assert.equal(invocation.command, "gh");
  assert.deepEqual(invocation.args, ["copilot", "--", "--help"]);
});

test("uses direct help invocation for non-gh providers", () => {
  const codexInvocation = getCliModelDiscoveryCommand("codex", "codex");
  assert.equal(codexInvocation.command, "codex");
  assert.deepEqual(codexInvocation.args, ["--help"]);

  const copilotDirectInvocation = getCliModelDiscoveryCommand("copilot", "/usr/local/bin/copilot");
  assert.equal(copilotDirectInvocation.command, "/usr/local/bin/copilot");
  assert.deepEqual(copilotDirectInvocation.args, ["--help"]);
});

test("parseCodexModelsCache keeps supported API slugs and sorts unique", () => {
  const raw = JSON.stringify({
    models: [
      { slug: "gpt-5.2-codex", supported_in_api: true },
      { slug: "gpt-5.1", supported_in_api: true },
      { slug: "gpt-5.1", supported_in_api: true },
      { slug: "internal-test", supported_in_api: false },
      { slug: 123, supported_in_api: true }
    ]
  });

  assert.deepEqual(parseCodexModelsCache(raw), ["gpt-5.1", "gpt-5.2-codex"]);
});

test("claude model discovery uses hardcoded list", async () => {
  const result = await discoverCliModels("claude", "claude");
  assert.equal(result.usedFallback, false);
  assert.equal(result.sourceLabel, "Built-in Claude model list");
  assert.deepEqual(result.models, [...CLAUDE_CLI_FALLBACK_MODELS]);
});

test("codex fallback list contains expected modern codex variants", () => {
  assert.deepEqual(CODEX_CLI_FALLBACK_MODELS.slice(-4), [
    "gpt-5.1-codex-mini",
    "gpt-5.2",
    "gpt-5.2-codex",
    "gpt-5.3-codex"
  ]);
});
