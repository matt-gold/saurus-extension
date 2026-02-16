import test from "node:test";
import assert from "node:assert/strict";
import { extractContextFromText } from "../context";

test("extracts bounded before/after context", () => {
  const text = "abcdefgHIJKLMNOPuvwxyz";
  const start = 7;
  const end = 16;

  const result = extractContextFromText(text, start, end, 4, 5);

  assert.equal(result.contextBefore, "defg");
  assert.equal(result.contextAfter, "uvwxy");
});

test("handles file boundaries", () => {
  const text = "short";
  const result = extractContextFromText(text, 0, 2, 50, 50);

  assert.equal(result.contextBefore, "");
  assert.equal(result.contextAfter, "ort");
});
