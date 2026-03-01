import * as vscode from "vscode";
import type { AiReasoningEffort, ProblemFinderResponse, SuggestionResponse } from "../../../types";
import type { CliAiProviderImplementation } from "../internal/cliProviders/types";
import { CliModelDiscoveryCommand } from "../modelDiscoveryShared";

/** Display metadata for an AI provider option. */
export type AiProviderPreset<K extends string = string> = {
  kind: K;
  quickPickLabel: string;
  displayLabel: string;
  defaultPath: string;
};

/** Result returned when discovering available models for an AI provider. */
export type AiProviderModelDiscoveryResult = {
  models: string[];
  sourceLabel: string;
  usedFallback: boolean;
  warningMessage?: string;
};

/** Inputs for provider-specific model discovery. */
export type AiProviderModelDiscoveryOptions = {
  aiPath: string;
  timeoutMs?: number;
};

/** Inputs for checking whether a provider can auto-run in background flows. */
export type AiProviderBackgroundCheckOptions = {
  extensionContext: vscode.ExtensionContext;
  model?: string;
};

/** Normalized AI generation request shape used by provider implementations. */
export type AiProviderGenerateRequest = {
  prompt: string;
  timeoutMs: number;
  model?: string;
  reasoningEffort: AiReasoningEffort;
  aiPath: string;
  workspaceDir: string;
  schemaPath: string;
  userInitiated: boolean;
};

/** Runtime behavior implemented by an AI provider. */
export type AiSuggestionProvider<K extends string = string> = {
  readonly kind: K;
  canGenerateInBackground: (options: AiProviderBackgroundCheckOptions) => Promise<boolean>;
  generate: (request: AiProviderGenerateRequest) => Promise<SuggestionResponse>;
  generateProblems: (request: AiProviderGenerateRequest) => Promise<ProblemFinderResponse>;
};

/** Unified definition for one AI provider (metadata + model discovery + runtime behavior). */
export type AiProviderDefinition<K extends string = string> = {
  kind: K;
  aliases: readonly string[];
  preset: AiProviderPreset<K>;
  isDefault?: boolean;
  isCli: boolean;
  runtime: AiSuggestionProvider<K>;
  discoverModels: (options: AiProviderModelDiscoveryOptions) => Promise<AiProviderModelDiscoveryResult>;
  getCliModelDiscoveryCommand?: (aiPath: string) => CliModelDiscoveryCommand;
  cliImplementation?: CliAiProviderImplementation<K>;
};
