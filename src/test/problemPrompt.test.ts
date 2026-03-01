import test from "node:test";
import assert from "node:assert/strict";
import { renderProblemPromptTemplate } from "../core/problems";

test("renders known problem prompt variables", () => {
  const template = "T:${targetText}|L:${contextLeft}|R:${contextRight}|D:${dismissedIssues}|N:${issueCount}|S:${scope}";
  const rendered = renderProblemPromptTemplate(template, {
    targetText: "Selected sentence.",
    contextLeft: "Left",
    contextRight: "Right",
    dismissedIssues: "1. [tone] Should this line be less formal?",
    issueCount: 12,
    fileName: "draft.md",
    languageId: "markdown",
    scope: "selection"
  });

  assert.match(rendered, /T:Selected sentence\./);
  assert.match(rendered, /L:Left/);
  assert.match(rendered, /R:Right/);
  assert.match(rendered, /D:1\. \[tone\] Should this line be less formal\?/);
  assert.match(rendered, /N:12/);
  assert.match(rendered, /S:selection/);
});

test("preserves unknown tokens", () => {
  const template = "A:${targetText}|X:${unknownToken}";
  const rendered = renderProblemPromptTemplate(template, {
    targetText: "Body",
    contextLeft: "",
    contextRight: "",
    dismissedIssues: "",
    issueCount: 5,
    fileName: "draft.md",
    languageId: "markdown",
    scope: "file"
  });

  assert.equal(rendered, "A:Body|X:${unknownToken}");
});

test("handles empty context safely", () => {
  const template = "B:[${contextBefore}]|A:[${contextAfter}]";
  const rendered = renderProblemPromptTemplate(template, {
    targetText: "Body",
    contextLeft: "",
    contextRight: "",
    dismissedIssues: "",
    issueCount: 5,
    fileName: "draft.md",
    languageId: "markdown",
    scope: "file"
  });

  assert.equal(rendered, "B:[]|A:[]");
});
