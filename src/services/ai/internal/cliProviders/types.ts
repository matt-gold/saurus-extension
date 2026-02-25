import type { AiReasoningEffort } from "../../../../types";

/** Input used to build a provider-specific CLI execution plan. */
export type CliProviderExecPlanInput = {
  aiPath: string;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  workspaceDir: string;
  schemaPath: string;
  prompt: string;
  outputLastMessagePath: string;
};

/** Provider-specific command plan for one CLI suggestion request. */
export type CliProviderExecPlan = {
  args: string[];
  stdinPrompt?: string;
  responseSource: "stdout" | "outputFile";
};

/** Provider-specific login/auth status check behavior. */
export type CliProviderLoginStatusBehavior = {
  args: string[];
  isAuthenticated: (stdout: string, stderr: string) => boolean;
};

/** Behavior contract for one CLI-backed AI provider implementation. */
export type CliAiProviderImplementation<K extends string = string> = {
  readonly kind: K;
  buildExecPlan: (input: CliProviderExecPlanInput) => CliProviderExecPlan;
  getLoginStatusBehavior?: (aiPath: string) => CliProviderLoginStatusBehavior | undefined;
  buildEnvOverrides?: (reasoningEffort?: AiReasoningEffort) => Record<string, string> | undefined;
  getMissingCliMessage: () => string;
  getAuthMessage: () => string;
};
