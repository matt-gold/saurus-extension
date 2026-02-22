import { SuggestionSourceFilter } from "./types";

export type CompletionSuggestionSource = "thesaurus" | "ai";

export interface CompletionSuggestionItem {
  id: string;
  source: CompletionSuggestionSource;
  label: string;
  insertText: string;
  detail?: string;
}

export interface BuildCompletionSuggestionsInput {
  sourceFilter: SuggestionSourceFilter;
  hasEntry: boolean;
  thesaurusOptions: string[];
  aiOptions: string[];
  thesaurusCached: boolean;
  aiCached: boolean;
  aiProviderName: string;
  thesaurusProvider: string;
  thesaurusPrefix: string;
  aiPrefix: string;
}

function formatThesaurusProviderName(provider: string): string {
  if (provider === "merriamWebster") {
    return "Merriam-Webster";
  }

  return provider;
}

function withPrefix(prefix: string, text: string): string {
  if (prefix.length === 0) {
    return text;
  }
  return `${prefix} ${text}`;
}

function pushSuggestions(
  items: CompletionSuggestionItem[],
  source: CompletionSuggestionSource,
  options: string[],
  prefix: string,
  startingNumber: number,
  detail: string
): void {
  let nextNumber = startingNumber;
  options.forEach((option, index) => {
    items.push({
      id: `suggestion:${source}:${index}`,
      source,
      label: withPrefix(prefix, `${nextNumber}  ${option}`),
      insertText: option,
      detail
    });
    nextNumber += 1;
  });
}

export function buildCompletionSuggestions(input: BuildCompletionSuggestionsInput): CompletionSuggestionItem[] {
  if (!input.hasEntry) {
    return [];
  }

  const items: CompletionSuggestionItem[] = [];
  const showThesaurus = input.sourceFilter !== "aiOnly";
  const showAi = input.sourceFilter !== "thesaurusOnly";

  if (showThesaurus && input.thesaurusOptions.length > 0) {
    const providerName = formatThesaurusProviderName(input.thesaurusProvider);
    const detail = input.thesaurusCached ? `From ${providerName} cache` : `From ${providerName} API`;
    pushSuggestions(items, "thesaurus", input.thesaurusOptions, input.thesaurusPrefix, 1, detail);
  }

  if (showAi && input.aiOptions.length > 0) {
    const detail = input.aiCached ? `From ${input.aiProviderName} cache` : `From ${input.aiProviderName}`;
    pushSuggestions(items, "ai", input.aiOptions, input.aiPrefix, 1, detail);
  }

  return items;
}
