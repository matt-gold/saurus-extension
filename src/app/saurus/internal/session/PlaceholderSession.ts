import { ParsedPlaceholderContent } from "../../../../core/placeholder";
import {
  PlaceholderMatch,
  SourceGenerationStates,
  SuggestionCacheEntry
} from "../../../../types";

/** Describes the active placeholder session resolved at a specific editor position. */
export type PlaceholderSession = {
  key: string;
  semanticKey: string;
  documentUri: string;
  documentVersion: number;
  match: PlaceholderMatch;
  parsedContent: ParsedPlaceholderContent;
  contextBefore: string;
  contextAfter: string;
  providerLabel: string;
  configuredModel?: string;
  entry?: SuggestionCacheEntry;
  sourceStates: SourceGenerationStates;
  isGenerating: boolean;
  hasSuggestions: boolean;
};
