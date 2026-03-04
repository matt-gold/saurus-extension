import { SourceGenerationStates, SuggestionSourceFilter } from "../../../types";

/** Represents provider menu item kinds. */
export type ProviderMenuItemKind = "refresh" | "refreshWithPrompt" | "suggestion" | "loading" | "empty";
/** Describes provider menu item source. */
export type ProviderMenuItemSource = "thesaurus" | "ai";

/** Represents a provider menu item. */
/** Represents a provider menu item. */
export type ProviderMenuItem = {
    kind: ProviderMenuItemKind;
    source?: ProviderMenuItemSource;
    label: string;
    insertText: string;
    detail?: string;
    sortText: string;
    disabled?: boolean;
};

/** Describes build provider items input. */
/** Describes build provider items input. */
export type BuildProviderItemsInput = {
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
};

type ProviderMenuVisibilityState = "actionsOnly" | "content";
type ProviderSourceSectionKind = "hidden" | "initialIdle" | "results" | "empty" | "error";

type ProviderSourceSectionState = {
    kind: ProviderSourceSectionKind;
    showLoadingRow: boolean;
};

type ProviderMenuRenderState = {
    visibility: ProviderMenuVisibilityState;
    thesaurus: ProviderSourceSectionState;
    ai: ProviderSourceSectionState;
};

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

/** Builds provider items. */
export function buildProviderItems(input: BuildProviderItemsInput): ProviderMenuItem[] {
  const items: ProviderMenuItem[] = [];
  const renderState = buildProviderMenuRenderState(input);

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
    }
  }

  let showRefreshAction = false;
  let showRefreshWithPromptAction = false;
  let refreshActionLoading = false;
  let refreshWithPromptActionLoading = false;

  if (renderState.ai.kind !== "hidden") {
    const aiSuggestionDetail = input.aiCached
      ? `From ${input.aiProviderName} cache`
      : `From ${input.aiProviderName}`;
    const generationInProgress = input.sourceStates.ai === "generating" || input.sourceStates.thesaurus === "generating";
    showRefreshAction = !generationInProgress
      || (input.sourceStates.ai === "generating" && input.aiActiveAction !== "refreshWithPrompt");
    showRefreshWithPromptAction = !generationInProgress
      || (input.sourceStates.ai === "generating" && input.aiActiveAction === "refreshWithPrompt");
    refreshActionLoading = input.sourceStates.ai === "generating" && input.aiActiveAction !== "refreshWithPrompt";
    refreshWithPromptActionLoading = input.sourceStates.ai === "generating" && input.aiActiveAction === "refreshWithPrompt";

    if (renderState.ai.kind === "results") {
      pushSuggestionItems(items, "ai", input.aiOptions, "021", input.aiPrefix, 1, aiSuggestionDetail);
    }
  }

  const hasSuggestions = items.some((item) => item.kind === "suggestion");
  const hasLoadingRows = items.some((item) => item.kind === "loading");
  const generationInProgress = input.sourceStates.thesaurus === "generating" || input.sourceStates.ai === "generating";
  if (renderState.visibility === "content" && !hasSuggestions && !hasLoadingRows && !generationInProgress) {
    items.push({
      kind: "empty",
      label: "No suggestions were found",
      insertText: "",
      detail: "Try generating again",
      sortText: "9800"
    });
  }

  if (renderState.ai.kind !== "hidden" && showRefreshAction) {
    items.push({
      kind: "refresh",
      label: refreshActionLoading
        ? "$(loading~spin) Generating AI suggestions..."
        : "↻ Generate more",
      insertText: input.placeholderRawText,
      detail: refreshActionLoading
        ? `Saurus is requesting options from ${input.aiProviderName}`
        : `with ${input.aiProviderName}`,
      sortText: "9900",
      disabled: input.sourceStates.ai === "generating"
    });
  }

  if (renderState.ai.kind !== "hidden" && showRefreshWithPromptAction) {
    items.push({
      kind: "refreshWithPrompt",
      label: refreshWithPromptActionLoading
        ? "$(loading~spin) Generating with prompt..."
        : "↻ Generate w/ prompt",
      insertText: input.placeholderRawText,
      detail: refreshWithPromptActionLoading
        ? "Generating with your custom direction"
        : `with ${input.aiProviderName}`,
      sortText: "9901",
      disabled: input.sourceStates.ai === "generating"
    });
  }

  return items;
}
