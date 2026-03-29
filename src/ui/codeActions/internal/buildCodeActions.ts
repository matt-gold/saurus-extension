import { SuggestionActionLookup } from "../../../types";

export type SaurusCodeActionItem =
  | { kind: "suggestion"; title: string; suggestion: string; preferred: boolean }
  | { kind: "generate"; title: string }
  | { kind: "generateWithPrompt"; title: string }
  | { kind: "loading"; title: string };

/** Builds the semantic Saurus Quick Fix menu from placeholder suggestion state. */
export function buildCodeActions(lookup: SuggestionActionLookup): SaurusCodeActionItem[] {
  const items: SaurusCodeActionItem[] = [];

  if (lookup.hasSuggestions && lookup.entry) {
    lookup.entry.suggestions.forEach((suggestion, index) => {
      items.push({
        kind: "suggestion",
        title: suggestion,
        suggestion,
        preferred: index === 0
      });
    });
  }

  if (lookup.isGenerating) {
    items.push({
      kind: "loading",
      title: "Saurus: Generating suggestions..."
    });
    return items;
  }

  items.push({
    kind: lookup.hasSuggestions ? "generate" : "generate",
    title: lookup.hasSuggestions ? "Saurus: Generate More" : "Saurus: Generate Suggestions"
  });
  items.push({
    kind: "generateWithPrompt",
    title: "Saurus: Generate With Prompt"
  });

  return items;
}
