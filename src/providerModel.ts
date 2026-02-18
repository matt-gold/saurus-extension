import { SourceGenerationStates, SuggestionSourceFilter } from "./types";

export type ProviderMenuItemKind = "heading" | "refresh" | "refreshWithPrompt" | "suggestion" | "loading" | "empty";
export type ProviderMenuItemSource = "thesaurus" | "ai";

export interface ProviderMenuItem {
  kind: ProviderMenuItemKind;
  source?: ProviderMenuItemSource;
  label: string;
  insertText: string;
  detail?: string;
  sortText: string;
  disabled?: boolean;
}

export interface BuildProviderItemsInput {
  sourceStates: SourceGenerationStates;
  sourceFilter: SuggestionSourceFilter;
  hasEntry: boolean;
  thesaurusOptions: string[];
  aiOptions: string[];
  thesaurusCached: boolean;
  aiCached: boolean;
  aiLoadedCount: number;
  aiLastAddedCount: number;
  aiLastResponseCached: boolean;
  aiProviderName: string;
  thesaurusProvider: string;
  thesaurusPrefix: string;
  aiPrefix: string;
  placeholderRawText: string;
  aiAutoRun: boolean;
  aiActiveAction?: "refresh" | "refreshWithPrompt";
}

function formatThesaurusProviderName(provider: string): string {
  if (provider === "merriamWebster") {
    return "Merriam-Webster";
  }

  return provider;
}

function buildThesaurusDetail(providerName: string, cached: boolean, fetching: boolean): string {
  const source = cached ? `From ${providerName} cache` : `From ${providerName} API`;
  return fetching ? `${source} • fetching now` : source;
}

function pushSuggestionItems(
  items: ProviderMenuItem[],
  source: ProviderMenuItemSource,
  options: string[],
  sortPrefix: string,
  emojiPrefix: string,
  startingNumber: number,
  detail: string
): void {
  let nextNumber = startingNumber;
  options.forEach((option, index) => {
    items.push({
      kind: "suggestion",
      source,
      label: `${emojiPrefix} ${nextNumber}  ${option}`,
      insertText: option,
      detail,
      sortText: `${sortPrefix}${String(index).padStart(3, "0")}`
    });
    nextNumber += 1;
  });
}

function withPrefix(prefix: string, text: string): string {
  if (prefix.length === 0) {
    return text;
  }
  return `${prefix} ${text}`;
}

export function buildProviderItems(input: BuildProviderItemsInput): ProviderMenuItem[] {
  if (!input.hasEntry && input.sourceStates.thesaurus === "idle" && input.sourceStates.ai === "idle") {
    return [];
  }

  const items: ProviderMenuItem[] = [];
  const showThesaurus = input.sourceFilter !== "aiOnly";
  const showAi = input.sourceFilter !== "thesaurusOnly";

  items.push({
    kind: "heading",
    label: "🦖  (Select a replacement below)",
    insertText: "",
    detail: "[Esc] to exit",
    sortText: "0000"
  });

  if (showThesaurus) {
    const thesaurusProviderName = formatThesaurusProviderName(input.thesaurusProvider);
    const thesaurusFetching = input.sourceStates.thesaurus === "generating";
    const thesaurusSuggestionDetail = buildThesaurusDetail(thesaurusProviderName, input.thesaurusCached, false);
    if (input.sourceStates.thesaurus === "generating" && input.thesaurusOptions.length === 0) {
      items.push({
        kind: "loading",
        source: "thesaurus",
        label: withPrefix(input.thesaurusPrefix, "$(loading~spin) Loading thesaurus suggestions..."),
        insertText: "",
        detail: buildThesaurusDetail(thesaurusProviderName, input.thesaurusCached, thesaurusFetching),
        sortText: "0100"
      });
    } else if (input.thesaurusOptions.length > 0) {
      pushSuggestionItems(items, "thesaurus", input.thesaurusOptions, "011", input.thesaurusPrefix, 1, thesaurusSuggestionDetail);
    } else {
      items.push({
        kind: "empty",
        source: "thesaurus",
        label: withPrefix(input.thesaurusPrefix, "No thesaurus suggestions found"),
        insertText: "",
        detail: "Try a simpler placeholder word",
        sortText: "0199"
      });
    }
  }

  if (showAi) {
    const aiSuggestionDetail = input.aiCached
      ? `From ${input.aiProviderName} cache`
      : `From ${input.aiProviderName} CLI`;
    if (input.sourceStates.ai === "generating") {
      items.push({
        kind: "loading",
        source: "ai",
        label: withPrefix(input.aiPrefix, "$(loading~spin) Generating AI suggestions..."),
        insertText: "",
        detail: `Saurus is requesting options from ${input.aiProviderName} CLI`,
        sortText: "0200"
      });
    }

    if (input.aiOptions.length > 0) {
      pushSuggestionItems(items, "ai", input.aiOptions, "021", input.aiPrefix, 1, aiSuggestionDetail);
    } else if (input.aiAutoRun && input.sourceStates.ai !== "generating") {
      items.push({
        kind: "empty",
        source: "ai",
        label: withPrefix(input.aiPrefix, "No AI suggestions yet"),
        insertText: "",
        detail: "Try ↻ Generate more",
        sortText: "0299"
      });
    }

    items.push({
      kind: "refresh",
      label: input.sourceStates.ai === "generating" && input.aiActiveAction === "refresh"
        ? "$(loading~spin) Getting more AI options..."
        : "↻ Generate more",
      insertText: input.placeholderRawText,
      detail: input.sourceStates.ai === "generating" && input.aiActiveAction === "refresh"
        ? `Getting more AI options from ${input.aiProviderName}`
        : `with ${input.aiProviderName} CLI`,
      sortText: "9900",
      disabled: input.sourceStates.ai === "generating"
    });

    items.push({
      kind: "refreshWithPrompt",
      label: input.sourceStates.ai === "generating" && input.aiActiveAction === "refreshWithPrompt"
        ? "$(loading~spin) Generating with prompt..."
        : "↻ Generate w/ prompt",
      insertText: input.placeholderRawText,
      detail: input.sourceStates.ai === "generating" && input.aiActiveAction === "refreshWithPrompt"
        ? "Generating with your custom direction"
        : `with ${input.aiProviderName} CLI`,
      sortText: "9901",
      disabled: input.sourceStates.ai === "generating"
    });
  }

  return items;
}
