import { ThesaurusLookupInfo, ThesaurusProviderKind } from "../../types";

/** Options for a thesaurus lookup request. */
export type ThesaurusLookupOptions = {
  apiKey: string;
  timeoutMs: number;
  maxSuggestions: number;
};

/** Result returned by a thesaurus provider lookup. */
export type ThesaurusLookupResult = {
  suggestions: string[];
  info: ThesaurusLookupInfo;
};

/** Behavior contract for thesaurus provider implementations. */
export type ThesaurusProvider = {
  readonly kind: ThesaurusProviderKind;
  lookup: (term: string, options: ThesaurusLookupOptions) => Promise<ThesaurusLookupResult>;
};

/** Represents invalid thesaurus configuration for the active provider. */
export class ThesaurusConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ThesaurusConfigError";
  }
}

/** Represents a failed thesaurus provider request. */
export class ThesaurusRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ThesaurusRequestError";
  }
}
