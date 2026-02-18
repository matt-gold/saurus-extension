import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { AiProviderKind, AiReasoningEffort, SuggestionResponse } from "./types";

export interface AiExecOptions {
  aiProvider: AiProviderKind;
  aiPath: string;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  timeoutMs: number;
  workspaceDir: string;
  schemaPath: string;
}

export interface AiRequestOptions extends AiExecOptions {
  prompt: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

type CommandEnvOverrides = Record<string, string>;

function normalizeProviderLabel(provider: AiProviderKind): string {
  switch (provider) {
    case "codex":
      return "Codex";
    case "copilot":
      return "Copilot";
    case "claude":
      return "Claude";
    default:
      return provider;
  }
}

export function getAiProviderLabel(provider: AiProviderKind): string {
  return normalizeProviderLabel(provider);
}

function isGhWrapperCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "gh" || base === "gh.exe";
}

export class AiCliMissingError extends Error {
  public constructor(provider: AiProviderKind, message?: string) {
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

export class AiAuthError extends Error {
  public constructor(provider: AiProviderKind, message?: string) {
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

export class AiRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

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

export function buildAiLoginStatusArgs(provider: AiProviderKind, aiPath?: string): string[] | undefined {
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
  provider: AiProviderKind,
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

function parseSuggestionJson(raw: string, provider: AiProviderKind): SuggestionResponse | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (Array.isArray(parsed)) {
    const values = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) {
      return { suggestions: values };
    }
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { suggestions?: unknown }).suggestions)) {
    return undefined;
  }

  const suggestions = (parsed as { suggestions: unknown[] }).suggestions
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (suggestions.length === 0) {
    throw new AiRequestError(`${normalizeProviderLabel(provider)} returned no valid suggestions.`);
  }

  return { suggestions };
}

function extractJsonCandidate(raw: string): string | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const object = raw.match(/\{[\s\S]*\}/);
  if (object?.[0]) {
    return object[0].trim();
  }

  const array = raw.match(/\[[\s\S]*\]/);
  if (array?.[0]) {
    return array[0].trim();
  }

  return undefined;
}

function parseSuggestionResponse(raw: string, provider: AiProviderKind): SuggestionResponse {
  const fromRaw = parseSuggestionJson(raw, provider);
  if (fromRaw) {
    return fromRaw;
  }

  const jsonCandidate = extractJsonCandidate(raw);
  if (jsonCandidate) {
    const fromCandidate = parseSuggestionJson(jsonCandidate, provider);
    if (fromCandidate) {
      return fromCandidate;
    }
  }

  const unique = new Set<string>();
  const lineSuggestions: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const candidate = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .trim();
    if (candidate.length === 0) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    if (unique.has(normalized)) {
      continue;
    }
    unique.add(normalized);
    lineSuggestions.push(candidate);
  }

  if (lineSuggestions.length > 0) {
    return { suggestions: lineSuggestions };
  }

  throw new AiRequestError(`${normalizeProviderLabel(provider)} returned no valid suggestions.`);
}

function maybeMapToAuthError(provider: AiProviderKind, stderr: string, stdout: string): Error | undefined {
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

    return parseSuggestionResponse(raw, options.aiProvider);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
