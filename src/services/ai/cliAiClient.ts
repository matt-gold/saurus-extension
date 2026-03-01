import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { parseProblemFinderResponse } from "./aiProblemResponseParser";
import { getAiProviderLabel as getAiProviderDisplayLabel } from "./aiProviderCatalog";
import { parseSuggestionResponse } from "./aiResponseParser";
import { getCliAiProviderDefinition } from "./providers";
import {
  AiProviderKind,
  AiReasoningEffort,
  CliAiProviderKind,
  ProblemFinderResponse,
  SuggestionResponse
} from "../../types";
import type { CliAiProviderImplementation } from "./internal/cliProviders/types";

/** Options for launching a CLI-backed AI provider. */
export type AiExecOptions = {
  aiProvider: CliAiProviderKind;
  aiPath: string;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  timeoutMs: number;
  workspaceDir: string;
  schemaPath: string;
};

/** Options for a CLI-backed AI suggestion request. */
export interface AiRequestOptions extends AiExecOptions {
  prompt: string;
}

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type CommandEnvOverrides = Record<string, string>;

function getCliProviderImplementation(provider: CliAiProviderKind): CliAiProviderImplementation<CliAiProviderKind> {
  const implementation = getCliAiProviderDefinition(provider).cliImplementation;
  if (!implementation) {
    throw new Error(`CLI implementation not configured for provider: ${provider}`);
  }
  return implementation;
}

/** Returns the display label for an AI provider kind. */
export function getAiProviderLabel(provider: AiProviderKind): string {
  return getAiProviderDisplayLabel(provider);
}

function normalizeProviderLabel(provider: AiProviderKind): string {
  return getAiProviderDisplayLabel(provider);
}

/** Represents a missing CLI executable for a configured AI provider. */
export class AiCliMissingError extends Error {
  public constructor(provider: CliAiProviderKind, message?: string) {
    if (message) {
      super(message);
    } else {
      super(getCliProviderImplementation(provider).getMissingCliMessage());
    }
    this.name = "AiCliMissingError";
  }
}

/** Represents an authentication error from a CLI-backed AI provider. */
export class AiAuthError extends Error {
  public constructor(provider: CliAiProviderKind, message?: string) {
    if (message) {
      super(message);
    } else {
      super(getCliProviderImplementation(provider).getAuthMessage());
    }
    this.name = "AiAuthError";
  }
}

/** Represents a request failure from a CLI-backed AI provider. */
export class AiRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

/** Builds provider-specific CLI arguments for one AI request. */
export function buildAiExecArgs(options: AiExecOptions, outputLastMessagePath: string, prompt: string): string[] {
  return getCliProviderImplementation(options.aiProvider)
    .buildExecPlan({
      aiPath: options.aiPath,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      workspaceDir: options.workspaceDir,
      schemaPath: options.schemaPath,
      prompt,
      outputLastMessagePath
    })
    .args;
}

/** Builds provider-specific login status args when a login check is supported. */
export function buildAiLoginStatusArgs(provider: CliAiProviderKind, aiPath?: string): string[] | undefined {
  if (!aiPath) {
    return undefined;
  }

  return getCliProviderImplementation(provider).getLoginStatusBehavior?.(aiPath)?.args;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  provider: CliAiProviderKind,
  input?: string,
  envOverrides?: CommandEnvOverrides
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...(envOverrides ?? {})
      },
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutHandle);
      if (error.code === "ENOENT") {
        reject(new AiCliMissingError(provider));
        return;
      }

      reject(error);
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.stdin.on("error", () => {
      // Ignore stdin pipe races on process shutdown.
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new AiRequestError(`${normalizeProviderLabel(provider)} request timed out after ${timeoutMs}ms.`));
        return;
      }

      resolve({
        code: code ?? -1,
        stdout,
        stderr
      });
    });

    if (typeof input === "string" && input.length > 0) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function maybeMapToAuthError(provider: CliAiProviderKind, stderr: string, stdout: string): Error | undefined {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  const authPatterns = [
    "not authenticated",
    "login required",
    "logged out",
    "gh auth login",
    "not logged in",
    "please login",
    "please log in",
    "authentication failed",
    "authentication_error",
    "api key",
    "anthropic_api_key",
    "x-api-key",
    "sign in",
    "unauthorized"
  ];
  if (authPatterns.some((pattern) => combined.includes(pattern))) {
    return new AiAuthError(provider);
  }

  return undefined;
}

/** Builds provider-specific environment overrides for a CLI AI request. */
export function buildAiEnvOverrides(
  options: Pick<AiExecOptions, "aiProvider" | "reasoningEffort">
): CommandEnvOverrides | undefined {
  return getCliProviderImplementation(options.aiProvider).buildEnvOverrides?.(options.reasoningEffort);
}

async function ensureAiLoggedIn(options: AiExecOptions): Promise<void> {
  const loginBehavior = getCliProviderImplementation(options.aiProvider).getLoginStatusBehavior?.(options.aiPath);
  if (!loginBehavior) {
    return;
  }

  const result = await runCommand(
    options.aiPath,
    loginBehavior.args,
    options.workspaceDir,
    Math.min(10000, options.timeoutMs),
    options.aiProvider
  );

  if (result.code !== 0 || !loginBehavior.isAuthenticated(result.stdout, result.stderr)) {
    throw new AiAuthError(options.aiProvider);
  }
}

/** Runs a suggestion request through a CLI-backed AI provider. */
export async function generateSuggestionsWithAi(options: AiRequestOptions): Promise<SuggestionResponse> {
  const raw = await generateRawAiResponse(options);
  return parseSuggestionResponse(raw, normalizeProviderLabel(options.aiProvider), (message) => new AiRequestError(message));
}

/** Runs a problem-finder request through a CLI-backed AI provider. */
export async function generateProblemsWithAi(options: AiRequestOptions): Promise<ProblemFinderResponse> {
  const raw = await generateRawAiResponse(options);
  return parseProblemFinderResponse(raw, normalizeProviderLabel(options.aiProvider), (message) => new AiRequestError(message));
}

/** Runs a CLI-backed AI request and returns raw provider output. */
export async function generateRawAiResponse(options: AiRequestOptions): Promise<string> {
  await ensureAiLoggedIn(options);

  const providerImplementation = getCliProviderImplementation(options.aiProvider);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "saurus-"));
  const outputFile = path.join(tmpDir, "ai-last-message.json");

  try {
    const execPlan = providerImplementation.buildExecPlan({
      aiPath: options.aiPath,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      workspaceDir: options.workspaceDir,
      schemaPath: options.schemaPath,
      prompt: options.prompt,
      outputLastMessagePath: outputFile
    });
    const envOverrides = providerImplementation.buildEnvOverrides?.(options.reasoningEffort);
    const result = await runCommand(
      options.aiPath,
      execPlan.args,
      options.workspaceDir,
      options.timeoutMs,
      options.aiProvider,
      execPlan.stdinPrompt,
      envOverrides
    );

    if (result.code !== 0) {
      throw maybeMapToAuthError(options.aiProvider, result.stderr, result.stdout) ??
        new AiRequestError(
          `${normalizeProviderLabel(options.aiProvider)} request failed (exit ${result.code}): ${result.stderr || result.stdout}`
        );
    }

    return execPlan.responseSource === "outputFile"
      ? await fs.readFile(outputFile, "utf8")
      : result.stdout;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
