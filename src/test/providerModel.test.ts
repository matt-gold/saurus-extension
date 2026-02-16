import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderItems } from "../providerModel";

test("returns generating state item", () => {
  const items = buildProviderItems({
    state: "generating",
    hasEntry: false,
    options: [],
    placeholderRawText: "{{word}}"
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "generating");
});

test("returns refresh as first item with cached options", () => {
  const items = buildProviderItems({
    state: "ready",
    hasEntry: true,
    options: ["option one", "option two"],
    placeholderRawText: "{{word}}"
  });

  assert.equal(items[0].kind, "refresh");
  assert.equal(items[1].insertText, "option one");
});

test("returns no-new-options item when cache is empty", () => {
  const items = buildProviderItems({
    state: "ready",
    hasEntry: true,
    options: [],
    placeholderRawText: "{{word}}"
  });

  assert.equal(items[0].kind, "refresh");
  assert.equal(items[1].kind, "empty");
});
