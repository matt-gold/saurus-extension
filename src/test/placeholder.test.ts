import test from "node:test";
import assert from "node:assert/strict";
import {
  findAllPlaceholdersInLine,
  findPlaceholderInLine
} from "../core/placeholder";

test("finds placeholder in default delimiters", () => {
  const line = "The bell was {{silent}} at dusk.";
  const cursor = line.indexOf("silent") + 2;
  const match = findPlaceholderInLine(line, cursor, "{{", "}}");

  assert.ok(match);
  assert.equal(match.rawInnerText, "silent");
  assert.equal(match.rawFullText, "{{silent}}");
});

test("returns undefined when cursor is outside placeholder", () => {
  const line = "The bell was {{silent}} at dusk.";
  const cursor = line.indexOf("dusk");
  const match = findPlaceholderInLine(line, cursor, "{{", "}}");

  assert.equal(match, undefined);
});

test("supports custom delimiters", () => {
  const line = "The bell was [[silent]] at dusk.";
  const cursor = line.indexOf("silent") + 1;
  const match = findPlaceholderInLine(line, cursor, "[[", "]]");

  assert.ok(match);
  assert.equal(match.rawInnerText, "silent");
  assert.equal(match.rawFullText, "[[silent]]");
});

test("supports alternate delimiter pair", () => {
  const line = "The bell was <%silent%> at dusk.";
  const cursor = line.indexOf("silent") + 1;
  const match = findPlaceholderInLine(line, cursor, "<%", "%>");

  assert.ok(match);
  assert.equal(match.rawInnerText, "silent");
  assert.equal(match.rawFullText, "<%silent%>");
});

test("findAllPlaceholdersInLine returns multiple placeholders in order", () => {
  const line = "A {{first}} and {{second}} token.";
  const matches = findAllPlaceholdersInLine(line, "{{", "}}");

  assert.equal(matches.length, 2);
  assert.equal(matches[0].rawInnerText, "first");
  assert.equal(matches[1].rawInnerText, "second");
});
