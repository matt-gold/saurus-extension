import { SourceGenerationStates } from "./types";

export type ProviderMenuItemKind = "refresh" | "suggestion" | "section" | "loading" | "empty";
export type ProviderMenuItemSource = "thesaurus" | "ai";

export interface ProviderMenuItem {
  kind: ProviderMenuItemKind;
  source?: ProviderMenuItemSource;
  label: string;
  insertText: string;
  detail?: string;
  sortText: string;
}

export interface BuildProviderItemsInput {
  sourceStates: SourceGenerationStates;
  hasEntry: boolean;
  thesaurusOptions: string[];
  aiOptions: string[];
  thesaurusCached: boolean;
  aiCached: boolean;
  thesaurusProvider: string;
  placeholderRawText: string;
  aiAutoRun: boolean;
}

function pushSection(
  items: ProviderMenuItem[],
  source: ProviderMenuItemSource,
  label: string,
  sortText: string,
  detail: string
): void {
  items.push({
    kind: "section",
    source,
    label,
    insertText: "",
    sortText,
    detail
  });
}

function formatThesaurusProviderName(provider: string): string {
  if (provider === "merriamWebster") {
    return "Merriam-Webster";
  }

  return provider;
}

function pushSuggestionItems(
  items: ProviderMenuItem[],
  source: ProviderMenuItemSource,
  options: string[],
  sortPrefix: string,
  startingNumber: number,
  detail: string
): void {
  let nextNumber = startingNumber;
  options.forEach((option, index) => {
    items.push({
      kind: "suggestion",
      source,
      label: `${nextNumber}. ${option}`,
      insertText: option,
      detail,
      sortText: `${sortPrefix}${String(index).padStart(3, "0")}`
    });
    nextNumber += 1;
  });
}

export function buildProviderItems(input: BuildProviderItemsInput): ProviderMenuItem[] {
  if (!input.hasEntry && input.sourceStates.thesaurus === "idle" && input.sourceStates.ai === "idle") {
    return [];
  }

  const items: ProviderMenuItem[] = [];

  const thesaurusProviderName = formatThesaurusProviderName(input.thesaurusProvider);
  const thesaurusCacheDetail = input.thesaurusCached ? "yes" : "no";
  const thesaurusFetchDetail = input.sourceStates.thesaurus === "generating" ? " • Fetching: yes" : "";
  const thesaurusSuggestionDetail = `Source: ${thesaurusProviderName} • Cached: ${thesaurusCacheDetail}`;
  pushSection(
    items,
    "thesaurus",
    "--- Thesaurus ---",
    "0000",
    `Source: ${thesaurusProviderName} • Cached: ${thesaurusCacheDetail}${thesaurusFetchDetail}`
  );
  if (input.sourceStates.thesaurus === "generating" && input.thesaurusOptions.length === 0) {
    items.push({
      kind: "loading",
      source: "thesaurus",
      label: "$(loading~spin) Loading thesaurus suggestions...",
      insertText: "",
      detail: "Saurus is requesting dictionary suggestions",
      sortText: "0001"
    });
  } else if (input.thesaurusOptions.length > 0) {
    pushSuggestionItems(items, "thesaurus", input.thesaurusOptions, "001", 1, thesaurusSuggestionDetail);
  } else {
    items.push({
      kind: "empty",
      source: "thesaurus",
      label: "No thesaurus suggestions found",
      insertText: "",
      detail: "Try a simpler placeholder word",
      sortText: "0099"
    });
  }

  const aiCacheDetail = input.aiCached ? "yes" : "no";
  const aiModeDetail = input.aiAutoRun ? "auto" : "on-demand";
  const aiFetchDetail = input.sourceStates.ai === "generating" ? " • Fetching: yes" : "";
  const aiSuggestionDetail = `Source: Codex • Cached: ${aiCacheDetail}`;
  pushSection(
    items,
    "ai",
    "--- AI ---",
    "0100",
    `Source: Codex • Cached: ${aiCacheDetail} • Mode: ${aiModeDetail}${aiFetchDetail}`
  );
  if (input.sourceStates.ai === "generating") {
    items.push({
      kind: "loading",
      source: "ai",
      label: "$(loading~spin) Generating AI suggestions...",
      insertText: "",
      detail: "Saurus is requesting options from Codex",
      sortText: "0101"
    });
  }

  if (input.aiOptions.length > 0) {
    pushSuggestionItems(items, "ai", input.aiOptions, "011", 1, aiSuggestionDetail);
  } else if (input.aiAutoRun && input.sourceStates.ai !== "generating") {
    items.push({
      kind: "empty",
      source: "ai",
      label: "No AI suggestions yet",
      insertText: "",
      detail: "Try ↻ Get more AI options",
      sortText: "0199"
    });
  }

  if (input.sourceStates.ai !== "generating") {
    items.push({
      kind: "refresh",
      label: input.aiOptions.length > 0
        ? "↻ Get more AI options"
        : "↻ Generate AI options",
      insertText: input.placeholderRawText,
      detail: "Generate additional AI options and avoid repeats",
      sortText: "9999"
    });
  }

  return items;
}
