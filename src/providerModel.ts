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

type ProviderMenuVisibilityState = "actionsOnly" | "content";
type ProviderSourceSectionKind = "hidden" | "initialIdle" | "results" | "empty" | "error";

interface ProviderSourceSectionState {
  kind: ProviderSourceSectionKind;
  showLoadingRow: boolean;
}

interface ProviderMenuRenderState {
  visibility: ProviderMenuVisibilityState;
  thesaurus: ProviderSourceSectionState;
  ai: ProviderSourceSectionState;
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

function buildThesaurusSectionState(
  input: BuildProviderItemsInput,
  menuVisibility: ProviderMenuVisibilityState,
  showThesaurus: boolean
): ProviderSourceSectionState {
  if (!showThesaurus) {
    return { kind: "hidden", showLoadingRow: false };
  }

  if (input.thesaurusOptions.length > 0) {
    return {
      kind: "results",
      showLoadingRow: input.sourceStates.thesaurus === "generating" && input.thesaurusOptions.length === 0
    };
  }

  if (input.sourceStates.thesaurus === "generating") {
    return { kind: "empty", showLoadingRow: true };
  }

  if (menuVisibility === "actionsOnly") {
    return { kind: "initialIdle", showLoadingRow: false };
  }

  if (input.sourceStates.thesaurus === "error") {
    return { kind: "error", showLoadingRow: false };
  }

  return { kind: "empty", showLoadingRow: false };
}

function buildAiSectionState(
  input: BuildProviderItemsInput,
  menuVisibility: ProviderMenuVisibilityState,
  showAi: boolean
): ProviderSourceSectionState {
  if (!showAi) {
    return { kind: "hidden", showLoadingRow: false };
  }

  if (input.aiOptions.length > 0) {
    return {
      kind: "results",
      showLoadingRow: input.sourceStates.ai === "generating"
    };
  }

  if (input.sourceStates.ai === "generating") {
    return { kind: "empty", showLoadingRow: true };
  }

  if (menuVisibility === "actionsOnly") {
    return { kind: "initialIdle", showLoadingRow: false };
  }

  if (input.sourceStates.ai === "error") {
    return { kind: "error", showLoadingRow: false };
  }

  if (input.aiAutoRun) {
    return { kind: "empty", showLoadingRow: false };
  }

  return { kind: "initialIdle", showLoadingRow: false };
}

function buildProviderMenuRenderState(input: BuildProviderItemsInput): ProviderMenuRenderState {
  const showThesaurus = input.sourceFilter !== "aiOnly";
  const showAi = input.sourceFilter !== "thesaurusOnly";
  const visibility: ProviderMenuVisibilityState = (
    !input.hasEntry &&
    input.sourceStates.thesaurus === "idle" &&
    input.sourceStates.ai === "idle"
  )
    ? "actionsOnly"
    : "content";

  return {
    visibility,
    thesaurus: buildThesaurusSectionState(input, visibility, showThesaurus),
    ai: buildAiSectionState(input, visibility, showAi)
  };
}

export function buildProviderItems(input: BuildProviderItemsInput): ProviderMenuItem[] {
  const items: ProviderMenuItem[] = [];
  const renderState = buildProviderMenuRenderState(input);

  items.push({
    kind: "heading",
    label: "🦖  (Select a replacement below)",
    insertText: "",
    detail: "[Esc] to exit",
    sortText: "0000"
  });

  if (renderState.thesaurus.kind !== "hidden") {
    const thesaurusProviderName = formatThesaurusProviderName(input.thesaurusProvider);
    const thesaurusFetching = renderState.thesaurus.showLoadingRow;
    const thesaurusSuggestionDetail = buildThesaurusDetail(thesaurusProviderName, input.thesaurusCached, false);
    if (renderState.thesaurus.showLoadingRow) {
      items.push({
        kind: "loading",
        source: "thesaurus",
        label: withPrefix(input.thesaurusPrefix, "$(loading~spin) Loading thesaurus suggestions..."),
        insertText: "",
        detail: buildThesaurusDetail(thesaurusProviderName, input.thesaurusCached, thesaurusFetching),
        sortText: "0100"
      });
    }

    if (renderState.thesaurus.kind === "results") {
      pushSuggestionItems(items, "thesaurus", input.thesaurusOptions, "011", input.thesaurusPrefix, 1, thesaurusSuggestionDetail);
    } else if (
      (renderState.thesaurus.kind === "empty" || renderState.thesaurus.kind === "error") &&
      !renderState.thesaurus.showLoadingRow
    ) {
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

  if (renderState.ai.kind !== "hidden") {
    const aiSuggestionDetail = input.aiCached
      ? `From ${input.aiProviderName} cache`
      : `From ${input.aiProviderName}`;
    if (renderState.ai.showLoadingRow) {
      items.push({
        kind: "loading",
        source: "ai",
        label: withPrefix(input.aiPrefix, "$(loading~spin) Generating AI suggestions..."),
        insertText: "",
        detail: `Saurus is requesting options from ${input.aiProviderName}`,
        sortText: "0200"
      });
    }

    if (renderState.ai.kind === "results") {
      pushSuggestionItems(items, "ai", input.aiOptions, "021", input.aiPrefix, 1, aiSuggestionDetail);
    } else if (renderState.ai.kind === "empty" && !renderState.ai.showLoadingRow) {
      items.push({
        kind: "empty",
        source: "ai",
        label: withPrefix(input.aiPrefix, "No AI suggestions yet"),
        insertText: "",
        detail: "Try ↻ Generate more",
        sortText: "0299"
      });
    }

    if (input.sourceStates.ai !== "generating") {
      items.push({
        kind: "refresh",
        label: "↻ Generate more",
        insertText: input.placeholderRawText,
        detail: `with ${input.aiProviderName}`,
        sortText: "9900",
        disabled: false
      });

      items.push({
        kind: "refreshWithPrompt",
        label: "↻ Generate w/ prompt",
        insertText: input.placeholderRawText,
        detail: `with ${input.aiProviderName}`,
        sortText: "9901",
        disabled: false
      });
    }
  }

  return items;
}
