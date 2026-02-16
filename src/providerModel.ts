import { GenerationState } from "./types";

export type ProviderMenuItemKind = "refresh" | "suggestion" | "generating" | "empty";

export interface ProviderMenuItem {
  kind: ProviderMenuItemKind;
  label: string;
  insertText: string;
  detail?: string;
  sortText: string;
}

export interface BuildProviderItemsInput {
  state: GenerationState;
  hasEntry: boolean;
  options: string[];
  placeholderRawText: string;
}

export function buildProviderItems(input: BuildProviderItemsInput): ProviderMenuItem[] {
  if (input.state === "generating") {
    return [
      {
        kind: "generating",
        label: "Generating suggestions...",
        insertText: input.placeholderRawText,
        detail: "Saurus is requesting options from Codex",
        sortText: "0000"
      }
    ];
  }

  if (!input.hasEntry) {
    return [];
  }

  const items: ProviderMenuItem[] = [
    {
      kind: "refresh",
      label: "↻ Get different options",
      insertText: input.placeholderRawText,
      detail: "Refresh options and avoid previously shown suggestions",
      sortText: "0000"
    }
  ];

  if (input.options.length === 0) {
    items.push({
      kind: "empty",
      label: "No new options found",
      insertText: input.placeholderRawText,
      detail: "Try refresh again or adjust prompt settings",
      sortText: "0001"
    });
    return items;
  }

  input.options.forEach((option, index) => {
    items.push({
      kind: "suggestion",
      label: option,
      insertText: option,
      detail: "Replace placeholder",
      sortText: `1${String(index).padStart(3, "0")}`
    });
  });

  return items;
}
