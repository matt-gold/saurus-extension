import test from "node:test";
import assert from "node:assert/strict";
import { __testOnly, extractThesaurusLookupTerm } from "../thesaurusClient";

test("extractThesaurusLookupTerm keeps the full placeholder text", () => {
  assert.equal(extractThesaurusLookupTerm("a dimly lit chamber"), "a dimly lit chamber");
  assert.equal(extractThesaurusLookupTerm("storm-torn phrase"), "storm-torn phrase");
  assert.equal(extractThesaurusLookupTerm("   "), "");
});

test("parseMerriamWebsterResponse handles entry payloads", () => {
  const payload = [
    {
      meta: {
        syns: [
          ["rapid", "swift"],
          ["quick", "fast"]
        ]
      }
    }
  ];

  const parsed = __testOnly.parseMerriamWebsterResponse(payload, 10);
  assert.deepEqual(parsed, ["rapid", "swift", "quick", "fast"]);
});

test("parseMerriamWebsterResponse handles suggestion-string payloads", () => {
  const payload = ["brisk", "quick", "quick", "swift"];
  const parsed = __testOnly.parseMerriamWebsterResponse(payload, 10);
  assert.deepEqual(parsed, ["brisk", "quick", "swift"]);
});

test("parseMerriamWebsterResponse enforces max suggestions", () => {
  const payload = ["one", "two", "three", "four"];
  const parsed = __testOnly.parseMerriamWebsterResponse(payload, 2);
  assert.deepEqual(parsed, ["one", "two"]);
});

test("parseMerriamWebsterResult includes helpful metadata", () => {
  const payload = [
    {
      fl: "adjective",
      shortdef: ["marked by little noise", "tranquil in mood"],
      meta: {
        syns: [["calm", "still"]],
        stems: ["quieter", "quietest"]
      }
    }
  ];

  const result = __testOnly.parseMerriamWebsterResult(payload, "quiet room", 5);
  assert.deepEqual(result.suggestions, ["calm", "still"]);
  assert.equal(result.info.query, "quiet room");
  assert.equal(result.info.partOfSpeech, "adjective");
  assert.deepEqual(result.info.definitions, ["marked by little noise", "tranquil in mood"]);
  assert.deepEqual(result.info.stems, ["quieter", "quietest"]);
  assert.equal(result.info.entryCount, 1);
});

test("parseMerriamWebsterResult captures did-you-mean suggestions", () => {
  const payload = ["quieet", "quiete"];
  const result = __testOnly.parseMerriamWebsterResult(payload, "quieet", 5);
  assert.deepEqual(result.suggestions, []);
  assert.deepEqual(result.info.didYouMean, ["quieet", "quiete"]);
});
