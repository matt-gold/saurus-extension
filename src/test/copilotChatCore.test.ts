import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCopilotChatSelectors,
  CopilotChatBlockedError,
  CopilotChatConsentRequiredError,
  CopilotChatRequestError,
  CopilotChatUnavailableError,
  mapCopilotChatError,
  selectFirstCopilotModel
} from "../copilotChatCore";

test("buildCopilotChatSelectors uses model hint then vendor fallback", () => {
  assert.deepEqual(buildCopilotChatSelectors("gpt-4.1"), [
    { vendor: "copilot", id: "gpt-4.1" },
    { vendor: "copilot", family: "gpt-4.1" },
    { vendor: "copilot" }
  ]);
});

test("buildCopilotChatSelectors without hint uses vendor-only selector", () => {
  assert.deepEqual(buildCopilotChatSelectors(undefined), [{ vendor: "copilot" }]);
});

test("selectFirstCopilotModel picks model from hinted selector when present", async () => {
  const model = await selectFirstCopilotModel("gpt-4.1", async (selector) => {
    if (selector.id === "gpt-4.1") {
      return [{ id: "id-hit" }];
    }
    return [];
  });

  assert.deepEqual(model, { id: "id-hit" });
});

test("selectFirstCopilotModel falls back to vendor-only selector when hint misses", async () => {
  const model = await selectFirstCopilotModel("missing-model", async (selector) => {
    if (!selector.id && !selector.family) {
      return [{ id: "fallback-hit" }];
    }
    return [];
  });

  assert.deepEqual(model, { id: "fallback-hit" });
});

test("mapCopilotChatError maps Language Model API codes", () => {
  assert.ok(mapCopilotChatError({ code: "NoPermissions" }) instanceof CopilotChatConsentRequiredError);
  assert.ok(mapCopilotChatError({ code: "Blocked" }) instanceof CopilotChatBlockedError);
  assert.ok(mapCopilotChatError({ code: "NotFound" }) instanceof CopilotChatUnavailableError);
});

test("mapCopilotChatError wraps unknown errors", () => {
  const mapped = mapCopilotChatError(new Error("boom"));
  assert.ok(mapped instanceof CopilotChatRequestError);
  assert.match(mapped.message, /boom/);
});
