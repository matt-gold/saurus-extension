import { ThesaurusProviderKind } from "../../types";
import { MerriamWebsterThesaurusProvider, __testOnly } from "./MerriamWebsterThesaurusProvider";
import { ThesaurusConfigError, ThesaurusProvider } from "./ThesaurusProvider";

/** Creates the configured thesaurus provider implementation. */
export function createThesaurusProvider(kind: ThesaurusProviderKind): ThesaurusProvider {
  switch (kind) {
    case "merriamWebster":
      return new MerriamWebsterThesaurusProvider();
    default:
      throw new ThesaurusConfigError(`Unsupported thesaurus provider: ${kind}`);
  }
}

export { __testOnly, MerriamWebsterThesaurusProvider, ThesaurusConfigError };
export type { ThesaurusLookupOptions, ThesaurusLookupResult, ThesaurusProvider } from "./ThesaurusProvider";
export { ThesaurusRequestError } from "./ThesaurusProvider";
