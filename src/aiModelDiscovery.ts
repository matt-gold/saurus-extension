import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { CliAiProviderKind } from "./types";

export interface CliModelDiscoveryCommand {
  command: string;
  args: string[];
  sourceLabel: string;
}

export interface ModelDiscoveryResult {
  models: string[];
  sourceLabel: string;
  usedFallback: boolean;
  warningMessage?: string;
}

export class AiModelDiscoveryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AiModelDiscoveryError";
  }
}

export const COPILOT_CLI_FALLBACK_MODELS: readonly string[] = [
  "claude-sonnet-4.6",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "claude-opus-4.6",
  "claude-opus-4.6-fast",
  "claude-opus-4.5",
  "claude-sonnet-4",
  "gemini-3-pro-preview",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1",
  "gpt-5.1-codex-mini",
  "gpt-5-mini",
  "gpt-4.1"
] as const;

export const CLAUDE_CLI_FALLBACK_MODELS: readonly string[] = [
  "opus",
  "sonnet",
  "haiku"
] as const;

export const CODEX_CLI_FALLBACK_MODELS: readonly string[] = [
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex"
] as const;

function isGhWrapperCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "gh" || base === "gh.exe";
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((a, b) => a.localeCompare(b));
}

export function getCliModelDiscoveryCommand(provider: CliAiProviderKind, aiPath: string): CliModelDiscoveryCommand {
  if (provider === "copilot" && isGhWrapperCommand(aiPath)) {
    return {
      command: aiPath,
      args: ["copilot", "--", "--help"],
      sourceLabel: "gh copilot -- --help"
    };
  }

  return {
    command: aiPath,
    args: ["--help"],
    sourceLabel: `${path.basename(aiPath)} --help`
  };
}

export function parseModelChoicesFromHelp(helpText: string): string[] {
  const modelFlagMatch = helpText.match(/--model\b[\s\S]{0,8000}?\(choices:\s*([\s\S]*?)\)/i);
  if (!modelFlagMatch) {
    return [];
  }

  const choicesBlock = modelFlagMatch[1];
  const quotedMatches = Array.from(choicesBlock.matchAll(/"([^"]+)"/g)).map((match) => match[1].trim());
  if (quotedMatches.length > 0) {
    return uniquePreserveOrder(quotedMatches);
  }

  const tokens = choicesBlock
    .split(/[,\n]/)
    .map((part) => part.trim())
    .map((part) => part.replace(/^["']|["']$/g, ""))
    .filter((part) => part.length > 0);
  return uniquePreserveOrder(tokens);
}

export function parseCodexModelsCache(rawJson: string): string[] {
  const parsed = JSON.parse(rawJson) as { models?: Array<{ slug?: unknown; supported_in_api?: unknown }> };
  if (!Array.isArray(parsed.models)) {
    return [];
  }

  const slugs = parsed.models
    .filter((model) => model && model.supported_in_api === true)
    .map((model) => (typeof model.slug === "string" ? model.slug : ""))
    .filter((slug) => slug.length > 0);

  return uniqueSorted(slugs);
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "pipe",
      env: process.env
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
        reject(new AiModelDiscoveryError(`AI provider CLI not found: ${command}`));
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

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new AiModelDiscoveryError(`Timed out while checking available models (${command}).`));
        return;
      }
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function discoverCopilotCliModels(aiPath: string, timeoutMs: number): Promise<ModelDiscoveryResult> {
  const invocation = getCliModelDiscoveryCommand("copilot", aiPath);
  try {
    const result = await runCommand(invocation.command, invocation.args, timeoutMs);
    if (result.code !== 0) {
      throw new AiModelDiscoveryError(
        `Failed to inspect available models via ${invocation.sourceLabel} (exit ${result.code}).`
      );
    }

    const models = parseModelChoicesFromHelp(`${result.stdout}\n${result.stderr}`);
    if (models.length === 0) {
      return {
        models: [...COPILOT_CLI_FALLBACK_MODELS],
        sourceLabel: "Built-in Copilot CLI fallback list",
        usedFallback: true,
        warningMessage: `Saurus: could not parse models from ${invocation.sourceLabel}; using fallback list.`
      };
    }

    return {
      models,
      sourceLabel: invocation.sourceLabel,
      usedFallback: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model discovery error.";
    return {
      models: [...COPILOT_CLI_FALLBACK_MODELS],
      sourceLabel: "Built-in Copilot CLI fallback list",
      usedFallback: true,
      warningMessage: `Saurus: ${message} Using fallback Copilot model list.`
    };
  }
}

async function discoverCodexCliModels(): Promise<ModelDiscoveryResult> {
  const cachePath = path.join(os.homedir(), ".codex", "models_cache.json");
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const models = parseCodexModelsCache(raw);
    if (models.length === 0) {
      return {
        models: [...CODEX_CLI_FALLBACK_MODELS],
        sourceLabel: "Built-in Codex fallback list",
        usedFallback: true,
        warningMessage: `Saurus: no supported models found in ${cachePath}; using fallback Codex model list.`
      };
    }
    return {
      models,
      sourceLabel: `${cachePath} (supported_in_api, sorted)`,
      usedFallback: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model discovery error.";
    return {
      models: [...CODEX_CLI_FALLBACK_MODELS],
      sourceLabel: "Built-in Codex fallback list",
      usedFallback: true,
      warningMessage: `Saurus: ${message} Using fallback Codex model list.`
    };
  }
}

function discoverClaudeCliModels(): ModelDiscoveryResult {
  return {
    models: [...CLAUDE_CLI_FALLBACK_MODELS],
    sourceLabel: "Built-in Claude model list",
    usedFallback: false
  };
}

export async function discoverCliModels(
  provider: CliAiProviderKind,
  aiPath: string,
  timeoutMs = 10000
): Promise<ModelDiscoveryResult> {
  if (provider === "copilot") {
    return discoverCopilotCliModels(aiPath, timeoutMs);
  }
  if (provider === "claude") {
    return discoverClaudeCliModels();
  }
  return discoverCodexCliModels();
}
