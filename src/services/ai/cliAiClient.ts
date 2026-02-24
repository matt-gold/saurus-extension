import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { getAiProviderLabel as getAiProviderDisplayLabel } from "./aiProviderCatalog";
import { parseSuggestionResponse } from "./aiResponseParser";
import { AiProviderKind, AiReasoningEffort, CliAiProviderKind, SuggestionResponse } from "../../types";

/** Options for ai exec. */
/** Options for ai exec. */
export type AiExecOptions = {
    aiProvider: CliAiProviderKind;
    aiPath: string;
    model?: string;
    reasoningEffort?: AiReasoningEffort;
    timeoutMs: number;
    workspaceDir: string;
    schemaPath: string;
};

/** Options for ai request. */
export interface AiRequestOptions extends AiExecOptions {
  prompt: string;
}

type CommandResult = {
    code: number;
    stdout: string;
    stderr: string;
};

type CommandEnvOverrides = Record<string, string>;

/** Returns ai provider label. */
export function getAiProviderLabel(provider: AiProviderKind): string {
  return getAiProviderDisplayLabel(provider);
}

function normalizeProviderLabel(provider: AiProviderKind): string {
  return getAiProviderDisplayLabel(provider);
}

function isGhWrapperCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "gh" || base === "gh.exe";
}

/** Represents a ai cli missing error. */
export class AiCliMissingError extends Error {
  public constructor(provider: CliAiProviderKind, message?: string) {
    const label = normalizeProviderLabel(provider);
    if (message) {
      super(message);
    } else if (provider === "copilot") {
      super("Copilot CLI not found. Install GitHub Copilot CLI or set saurus.ai.path to gh.");
    } else {
      super(`${label} CLI not found. Install ${label} CLI or update saurus.ai.path.`);
    }
    this.name = "AiCliMissingError";
  }
}

/** Represents a ai auth error. */
export class AiAuthError extends Error {
  public constructor(provider: CliAiProviderKind, message?: string) {
    const label = normalizeProviderLabel(provider);
    if (message) {
      super(message);
    } else if (provider === "codex") {
      super("Codex CLI is not authenticated. Run `codex login` and try again.");
    } else if (provider === "copilot") {
      super("Copilot CLI is not authenticated. Run `gh auth login` (or sign in to Copilot CLI) and try again.");
    } else if (provider === "claude") {
      super("Claude CLI is not authenticated. Start `claude` and complete login, or set `ANTHROPIC_API_KEY`.");
    } else {
      super(`${label} CLI is not authenticated. Log in and try again.`);
    }
    this.name = "AiAuthError";
  }
}

/** Represents a ai request error. */
export class AiRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

/** Builds ai exec args. */
export function buildAiExecArgs(options: AiExecOptions, outputLastMessagePath: string, prompt: string): string[] {
  if (options.aiProvider === "codex") {
    const args = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "-C",
      options.workspaceDir,
      "--output-schema",
      options.schemaPath,
      "--output-last-message",
      outputLastMessagePath
    ];

    if (options.reasoningEffort && options.reasoningEffort.trim().length > 0) {
      args.push("-c", `model_reasoning_effort=${JSON.stringify(options.reasoningEffort.trim())}`);
    }

    if (options.model && options.model.trim().length > 0) {
      args.push("--model", options.model.trim());
    }

    args.push("-");
    return args;
  }

  if (options.aiProvider === "copilot") {
    const args = isGhWrapperCommand(options.aiPath)
      ? ["copilot", "--"]
      : [];

    if (options.model && options.model.trim().length > 0) {
      args.push("--model", options.model.trim());
    }
    args.push("-s", "-p", prompt);
    return args;
  }

  const args: string[] = [];
  if (options.model && options.model.trim().length > 0) {
    args.push("--model", options.model.trim());
  }
  args.push("-p", prompt);
  return args;
}

/** Builds ai login status args. */
export function buildAiLoginStatusArgs(provider: CliAiProviderKind, aiPath?: string): string[] | undefined {
  if (provider === "codex") {
    return ["login", "status"];
  }
  if (provider === "copilot" && aiPath && isGhWrapperCommand(aiPath)) {
    return ["auth", "status"];
  }
  return undefined;
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

/** Builds ai env overrides. */
export function buildAiEnvOverrides(
  options: Pick<AiExecOptions, "aiProvider" | "reasoningEffort">
): CommandEnvOverrides | undefined {
  if (options.aiProvider !== "claude") {
    return undefined;
  }

  const overrides: CommandEnvOverrides = {};
  switch (options.reasoningEffort) {
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

async function ensureAiLoggedIn(options: AiExecOptions): Promise<void> {
  const loginArgs = buildAiLoginStatusArgs(options.aiProvider, options.aiPath);
  if (!loginArgs) {
    return;
  }

  const result = await runCommand(
    options.aiPath,
    loginArgs,
    options.workspaceDir,
    Math.min(10000, options.timeoutMs),
    options.aiProvider
  );

  if (result.code !== 0) {
    throw new AiAuthError(options.aiProvider);
  }

  if (options.aiProvider === "codex") {
    const output = `${result.stdout}\n${result.stderr}`;
    if (!/logged in/i.test(output)) {
      throw new AiAuthError(options.aiProvider);
    }
    return;
  }

  if (options.aiProvider === "copilot" && isGhWrapperCommand(options.aiPath)) {
    const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (output.includes("not logged into any github hosts")) {
      throw new AiAuthError(options.aiProvider);
    }
    return;
  }
}

/** Implements generate suggestions with ai. */
export async function generateSuggestionsWithAi(options: AiRequestOptions): Promise<SuggestionResponse> {
  await ensureAiLoggedIn(options);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "saurus-"));
  const outputFile = path.join(tmpDir, "ai-last-message.json");

  try {
    const args = buildAiExecArgs(options, outputFile, options.prompt);
    const stdinPrompt = options.aiProvider === "codex" ? options.prompt : undefined;
    const envOverrides = buildAiEnvOverrides(options);
    const result = await runCommand(
      options.aiPath,
      args,
      options.workspaceDir,
      options.timeoutMs,
      options.aiProvider,
      stdinPrompt,
      envOverrides
    );

    if (result.code !== 0) {
      throw maybeMapToAuthError(options.aiProvider, result.stderr, result.stdout) ??
        new AiRequestError(
          `${normalizeProviderLabel(options.aiProvider)} request failed (exit ${result.code}): ${result.stderr || result.stdout}`
        );
    }

    const raw = options.aiProvider === "codex"
      ? await fs.readFile(outputFile, "utf8")
      : result.stdout;

    return parseSuggestionResponse(raw, normalizeProviderLabel(options.aiProvider), (message) => new AiRequestError(message));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
