import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { CodexReasoningEffort, SuggestionResponse } from "./types";

export interface CodexExecOptions {
  codexPath: string;
  model?: string;
  reasoningEffort?: CodexReasoningEffort;
  timeoutMs: number;
  workspaceDir: string;
  schemaPath: string;
}

export interface CodexRequestOptions extends CodexExecOptions {
  prompt: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class CodexCliMissingError extends Error {
  public constructor(message = "Codex CLI not found. Install Codex CLI or update saurus.codex.path.") {
    super(message);
    this.name = "CodexCliMissingError";
  }
}

export class CodexAuthError extends Error {
  public constructor(message = "Codex CLI is not authenticated. Run `codex login` and try again.") {
    super(message);
    this.name = "CodexAuthError";
  }
}

export class CodexRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CodexRequestError";
  }
}

export function buildCodexExecArgs(options: CodexExecOptions, outputLastMessagePath: string): string[] {
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

export function buildCodexLoginStatusArgs(): string[] {
  return ["login", "status"];
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  input?: string
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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
        reject(new CodexCliMissingError());
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
        reject(new CodexRequestError(`Codex request timed out after ${timeoutMs}ms.`));
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

function parseSuggestionResponse(raw: string): SuggestionResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CodexRequestError(`Invalid JSON returned by Codex CLI: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { suggestions?: unknown }).suggestions)) {
    throw new CodexRequestError("Codex response is missing a valid suggestions array.");
  }

  const suggestions = (parsed as { suggestions: unknown[] }).suggestions
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (suggestions.length === 0) {
    throw new CodexRequestError("Codex returned no valid suggestions.");
  }

  return { suggestions };
}

function maybeMapToAuthError(stderr: string, stdout: string): Error | undefined {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  if (combined.includes("not authenticated") || combined.includes("login") || combined.includes("logged out")) {
    return new CodexAuthError();
  }

  return undefined;
}

async function ensureCodexLoggedIn(options: CodexExecOptions): Promise<void> {
  const result = await runCommand(
    options.codexPath,
    buildCodexLoginStatusArgs(),
    options.workspaceDir,
    Math.min(10000, options.timeoutMs)
  );

  const output = `${result.stdout}\n${result.stderr}`;
  if (result.code !== 0 || !/logged in/i.test(output)) {
    throw new CodexAuthError();
  }
}

export async function generateSuggestionsWithCodex(options: CodexRequestOptions): Promise<SuggestionResponse> {
  await ensureCodexLoggedIn(options);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "saurus-"));
  const outputFile = path.join(tmpDir, "codex-last-message.json");

  try {
    const args = buildCodexExecArgs(options, outputFile);
    const result = await runCommand(options.codexPath, args, options.workspaceDir, options.timeoutMs, options.prompt);

    if (result.code !== 0) {
      throw maybeMapToAuthError(result.stderr, result.stdout) ??
        new CodexRequestError(`Codex request failed (exit ${result.code}): ${result.stderr || result.stdout}`);
    }

    const raw = await fs.readFile(outputFile, "utf8");
    return parseSuggestionResponse(raw);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
