import { spawn } from "child_process";

/** CLI invocation used for provider model discovery. */
export type CliModelDiscoveryCommand = {
  command: string;
  args: string[];
  sourceLabel: string;
};

/** Error raised when model discovery cannot inspect provider models. */
export class AiModelDiscoveryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AiModelDiscoveryError";
  }
}

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** Parses `--model` choice lists from CLI help output. */
export function parseModelChoicesFromHelp(helpText: string): string[] {
  const modelFlagMatch = helpText.match(/--model\b[\s\S]{0,8000}?\(choices:\s*([\s\S]*?)\)/i);
  if (!modelFlagMatch) {
    return [];
  }

  const uniquePreserveOrder = (values: string[]): string[] => {
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
  };

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

/** Parses a Codex `models_cache.json` payload into sorted API-supported slugs. */
export function parseCodexModelsCache(rawJson: string): string[] {
  const parsed = JSON.parse(rawJson) as { models?: Array<{ slug?: unknown; supported_in_api?: unknown }> };
  if (!Array.isArray(parsed.models)) {
    return [];
  }

  const slugs = parsed.models
    .filter((model) => model && model.supported_in_api === true)
    .map((model) => (typeof model.slug === "string" ? model.slug : ""))
    .filter((slug) => slug.length > 0);

  return Array.from(new Set(slugs)).sort((a, b) => a.localeCompare(b));
}

/** Runs a CLI command used for model discovery and captures stdout/stderr. */
export function runCliModelDiscoveryCommand(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
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
