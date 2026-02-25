import * as path from "path";
import type { CliAiProviderImplementation } from "./types";

function isGhWrapperCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "gh" || base === "gh.exe";
}

function appendModelArg(args: string[], model?: string): void {
  const trimmed = model?.trim();
  if (trimmed) {
    args.push("--model", trimmed);
  }
}

/** Implements Copilot CLI request planning behavior. */
export const COPILOT_CLI_PROVIDER: CliAiProviderImplementation<"copilot"> = {
  kind: "copilot",
  getMissingCliMessage() {
    return "Copilot CLI not found. Install GitHub Copilot CLI or set saurus.ai.path to gh.";
  },
  getAuthMessage() {
    return "Copilot CLI is not authenticated. Run `gh auth login` (or sign in to Copilot CLI) and try again.";
  },
  buildExecPlan(input) {
    const args = isGhWrapperCommand(input.aiPath)
      ? ["copilot", "--"]
      : [];

    appendModelArg(args, input.model);
    args.push("-s", "-p", input.prompt);

    return {
      args,
      responseSource: "stdout"
    };
  },
  getLoginStatusBehavior(aiPath) {
    if (!isGhWrapperCommand(aiPath)) {
      return undefined;
    }

    return {
      args: ["auth", "status"],
      isAuthenticated(stdout, stderr) {
        return !`${stdout}\n${stderr}`.toLowerCase().includes("not logged into any github hosts");
      }
    };
  }
};
