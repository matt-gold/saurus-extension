import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

type CommandContribution = {
  command: string;
  title: string;
};

type KeybindingContribution = {
  command: string;
  mac?: string;
  linux?: string;
  win?: string;
  when?: string;
};

type ConfigurationProperty = {
  default?: unknown;
  minimum?: number;
  maximum?: number;
};

const repoRoot = path.resolve(__dirname, "..", "..");
const packageJsonPath = path.join(repoRoot, "package.json");

function readManifest(): {
  activationEvents: string[];
  contributes: {
    commands: CommandContribution[];
    keybindings: KeybindingContribution[];
    configuration: {
      properties: Record<string, ConfigurationProperty>;
    };
  };
} {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

test("manifest contributes problem finder command and activation event", () => {
  const manifest = readManifest();

  assert.ok(manifest.activationEvents.includes("onCommand:saurus.findProblems"));

  const command = manifest.contributes.commands.find((entry) => entry.command === "saurus.findProblems");
  assert.ok(command);
  assert.equal(command.title, "Saurus: Diagnose Writing Problems");
});

test("manifest contributes problem finder keybinding", () => {
  const manifest = readManifest();

  const keybinding = manifest.contributes.keybindings.find((entry) => entry.command === "saurus.findProblems");
  assert.ok(keybinding);
  assert.equal(keybinding.mac, "cmd+shift+d");
  assert.equal(keybinding.linux, "ctrl+shift+d");
  assert.equal(keybinding.win, "ctrl+shift+d");
  assert.equal(keybinding.when, "editorTextFocus && !suggestWidgetVisible");
});

test("manifest contributes problem finder settings defaults", () => {
  const manifest = readManifest();
  const properties = manifest.contributes.configuration.properties;

  const template = properties["saurus.problemFinder.prompt.template"];
  assert.ok(template);
  assert.equal(typeof template.default, "string");
  assert.match(template.default as string, /Do not report spelling or typo issues\./);
  assert.match(template.default as string, /constructive question/i);
  assert.match(template.default as string, /Previously dismissed issues/i);

  const maxIssues = properties["saurus.problemFinder.maxIssues"];
  assert.ok(maxIssues);
  assert.equal(maxIssues.default, 12);
  assert.equal(maxIssues.minimum, 1);
  assert.equal(maxIssues.maximum, 20);
});
