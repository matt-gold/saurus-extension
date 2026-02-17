import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderItems } from "../providerModel";

test("returns empty when no entry and all sources idle", () => {
  const items = buildProviderItems({
    sourceStates: { thesaurus: "idle", ai: "idle" },
    hasEntry: false,
    thesaurusOptions: [],
    aiOptions: [],
    thesaurusCached: false,
    aiCached: false,
    thesaurusProvider: "merriamWebster",
    placeholderRawText: "{{word}}",
    aiAutoRun: false
  });

  assert.equal(items.length, 0);
});

test("renders grouped thesaurus and ai sections", () => {
  const items = buildProviderItems({
    sourceStates: { thesaurus: "ready", ai: "ready" },
    hasEntry: true,
    thesaurusOptions: ["lucid", "clear"],
    aiOptions: ["pellucid phrase"],
    thesaurusCached: true,
    aiCached: true,
    thesaurusProvider: "merriamWebster",
    placeholderRawText: "{{word}}",
    aiAutoRun: true
  });

  assert.equal(items[0].kind, "section");
  assert.equal(items[0].label, "--- Thesaurus ---");
  assert.equal(items[0].detail, "Source: Merriam-Webster • Cached: yes");
  assert.equal(items[1].label, "1. lucid");
  assert.equal(items[2].label, "2. clear");
  assert.equal(items[1].detail, "Source: Merriam-Webster • Cached: yes");
  assert.equal(items[3].kind, "section");
  assert.equal(items[3].label, "--- AI ---");
  assert.equal(items[3].detail, "Source: Codex • Cached: yes • Mode: auto");
  assert.equal(items[4].label, "1. pellucid phrase");
  assert.equal(items[4].detail, "Source: Codex • Cached: yes");
  assert.equal(items.at(-1)?.kind, "refresh");
  assert.equal(items.at(-1)?.label, "↻ Get more AI options");
});

test("moves on-demand messaging into ai section detail and removes info row", () => {
  const items = buildProviderItems({
    sourceStates: { thesaurus: "ready", ai: "idle" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: [],
    thesaurusCached: true,
    aiCached: false,
    thesaurusProvider: "merriamWebster",
    placeholderRawText: "{{word}}",
    aiAutoRun: false
  });

  const aiSection = items.find((item) => item.kind === "section" && item.source === "ai");
  assert.ok(aiSection);
  assert.equal(aiSection?.detail, "Source: Codex • Cached: no • Mode: on-demand");
  assert.equal(items.some((item) => item.kind === "empty" && item.source === "ai"), false);
});

test("shows thesaurus loading row while fetching", () => {
  const items = buildProviderItems({
    sourceStates: { thesaurus: "generating", ai: "idle" },
    hasEntry: true,
    thesaurusOptions: [],
    aiOptions: [],
    thesaurusCached: false,
    aiCached: false,
    thesaurusProvider: "merriamWebster",
    placeholderRawText: "{{word}}",
    aiAutoRun: false
  });

  const thesaurusSection = items.find((item) => item.kind === "section" && item.source === "thesaurus");
  assert.ok(thesaurusSection);
  assert.equal(thesaurusSection?.detail, "Source: Merriam-Webster • Cached: no • Fetching: yes");

  const loading = items.find((item) => item.kind === "loading" && item.source === "thesaurus");
  assert.ok(loading);
});

test("hides refresh row while ai generation is in progress", () => {
  const items = buildProviderItems({
    sourceStates: { thesaurus: "ready", ai: "generating" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: [],
    thesaurusCached: true,
    aiCached: false,
    thesaurusProvider: "merriamWebster",
    placeholderRawText: "{{word}}",
    aiAutoRun: false
  });

  assert.equal(items.some((item) => item.kind === "refresh"), false);
});

test("keeps existing ai and thesaurus options visible while ai is generating more", () => {
  const items = buildProviderItems({
    sourceStates: { thesaurus: "ready", ai: "generating" },
    hasEntry: true,
    thesaurusOptions: ["quiet"],
    aiOptions: ["still", "calm"],
    thesaurusCached: true,
    aiCached: true,
    thesaurusProvider: "merriamWebster",
    placeholderRawText: "{{word}}",
    aiAutoRun: false
  });

  assert.equal(items.some((item) => item.kind === "loading" && item.source === "ai"), true);
  assert.equal(items.some((item) => item.label === "1. quiet"), true);
  assert.equal(items.some((item) => item.label === "1. still"), true);
  assert.equal(items.some((item) => item.label === "2. calm"), true);
  assert.equal(items.some((item) => item.kind === "refresh"), false);
});
