import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const srcRoot = path.join(repoRoot, "src");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function readImports(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const imports: string[] = [];
  const importPattern = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of text.matchAll(importPattern)) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveRelativeImport(sourceFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    `${basePath}.ts`,
    path.join(basePath, "index.ts")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return undefined;
}

function toSrcRelative(filePath: string): string {
  return path.relative(srcRoot, filePath).split(path.sep).join("/");
}

function moduleId(srcRelativePath: string): string {
  const parts = srcRelativePath.split("/");

  if (parts[0] === "test") {
    return "test";
  }
  if (srcRelativePath === "extension.ts") {
    return "extension";
  }
  if (srcRelativePath === "types.ts") {
    return "types";
  }

  if (parts[0] === "app" && parts[1] === "saurus") {
    return "app/saurus";
  }
  if (parts[0] === "commands" && parts[1] === "config") {
    return "commands/config";
  }
  if (parts[0] === "commands") {
    return "commands";
  }
  if (parts[0] === "core" && parts[1]) {
    return `core/${parts[1]}`;
  }
  if (parts[0] === "services" && parts[1]) {
    return `services/${parts[1]}`;
  }
  if (parts[0] === "ui" && parts[1]) {
    return `ui/${parts[1]}`;
  }
  if (parts[0] === "config" || parts[0] === "state" || parts[0] === "app") {
    return parts[0];
  }

  return parts[0];
}

function owningModulePrefix(srcRelativePath: string): string {
  const internalIndex = srcRelativePath.indexOf("/internal/");
  if (internalIndex >= 0) {
    return srcRelativePath.slice(0, internalIndex);
  }

  const id = moduleId(srcRelativePath);
  return id === "extension" || id === "types" || id === "test" ? srcRelativePath : id;
}

test("module boundaries use public surfaces and keep internal files private", () => {
  const sourceFiles = listSourceFiles(srcRoot).filter((file) => !file.includes(`${path.sep}test${path.sep}`));

  const violations: string[] = [];

  for (const sourceFile of sourceFiles) {
    const sourceRel = toSrcRelative(sourceFile);
    const sourceModule = moduleId(sourceRel);

    for (const specifier of readImports(sourceFile)) {
      const resolved = resolveRelativeImport(sourceFile, specifier);
      if (!resolved) {
        continue;
      }

      const targetRel = toSrcRelative(resolved);
      const targetModule = moduleId(targetRel);
      const edge = `${sourceRel} -> ${targetRel}`;

      if (sourceRel === targetRel) {
        continue;
      }

      if (targetRel.includes("/internal/")) {
        const targetOwner = owningModulePrefix(targetRel);
        const sourceOwner = owningModulePrefix(sourceRel);
        const isSameOwner = sourceOwner === targetOwner || sourceRel.startsWith(`${targetOwner}/`);
        const isAllowedCompositionRootEdge =
          sourceRel === "extension.ts" && targetRel.startsWith("app/saurus/internal/");

        if (!isSameOwner && !isAllowedCompositionRootEdge) {
          violations.push(
            `internal import not allowed: ${edge} (only ${targetOwner}/* and extension.ts may import this internal module)`
          );
        }
        continue;
      }

      if (sourceModule === "test" || targetModule === "types") {
        continue;
      }

      if (sourceModule === targetModule) {
        continue;
      }

      if (!targetRel.endsWith("/index.ts")) {
        violations.push(`cross-module import must use public index.ts: ${edge}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
