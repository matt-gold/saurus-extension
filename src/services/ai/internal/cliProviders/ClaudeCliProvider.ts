import type { AiReasoningEffort } from "../../../../types";
import type { CliAiProviderImplementation } from "./types";

function appendModelArg(args: string[], model?: string): void {
  const trimmed = model?.trim();
  if (trimmed) {
    args.push("--model", trimmed);
  }
}

function buildClaudeEnvOverrides(reasoningEffort?: AiReasoningEffort): Record<string, string> | undefined {
  const overrides: Record<string, string> = {};

  switch (reasoningEffort) {
    case "none":
      // Claude Code supports disabling extended thinking via MAX_THINKING_TOKENS=0.
      overrides.MAX_THINKING_TOKENS = "0";
      break;
    case "low":
      overrides.CLAUDE_CODE_EFFORT_LEVEL = "low";
      break;
    case "medium":
      overrides.CLAUDE_CODE_EFFORT_LEVEL = "medium";
      break;
    case "high":
    case "xhigh":
      overrides.CLAUDE_CODE_EFFORT_LEVEL = "high";
      break;
    default:
      break;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/** Implements Claude CLI request planning behavior. */
export const CLAUDE_CLI_PROVIDER: CliAiProviderImplementation<"claude"> = {
  kind: "claude",
  getMissingCliMessage() {
    return "Claude CLI not found. Install Claude CLI or update saurus.ai.path.";
  },
  getAuthMessage() {
    return "Claude CLI is not authenticated. Start `claude` and complete login, or set `ANTHROPIC_API_KEY`.";
  },
  buildExecPlan(input) {
    const args: string[] = [];
    appendModelArg(args, input.model);
    args.push("-p", input.prompt);

    return {
      args,
      responseSource: "stdout"
    };
  },
  buildEnvOverrides: buildClaudeEnvOverrides
};
