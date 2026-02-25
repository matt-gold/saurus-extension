import type { CliAiProviderImplementation } from "./types";

function appendModelArg(args: string[], model?: string): void {
  const trimmed = model?.trim();
  if (trimmed) {
    args.push("--model", trimmed);
  }
}

/** Implements Codex CLI request planning behavior. */
export const CODEX_CLI_PROVIDER: CliAiProviderImplementation<"codex"> = {
  kind: "codex",
  getMissingCliMessage() {
    return "Codex CLI not found. Install Codex CLI or update saurus.ai.path.";
  },
  getAuthMessage() {
    return "Codex CLI is not authenticated. Run `codex login` and try again.";
  },
  buildExecPlan(input) {
    const args = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "-C",
      input.workspaceDir,
      "--output-schema",
      input.schemaPath,
      "--output-last-message",
      input.outputLastMessagePath
    ];

    const reasoningEffort = input.reasoningEffort?.trim();
    if (reasoningEffort) {
      args.push("-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
    }

    appendModelArg(args, input.model);
    args.push("-");

    return {
      args,
      stdinPrompt: input.prompt,
      responseSource: "outputFile"
    };
  },
  getLoginStatusBehavior() {
    return {
      args: ["login", "status"],
      isAuthenticated(stdout, stderr) {
        return /logged in/i.test(`${stdout}\n${stderr}`);
      }
    };
  }
};
