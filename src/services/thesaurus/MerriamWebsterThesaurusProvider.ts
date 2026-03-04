import { normalizeSuggestion } from "../../core/suggestions";
import { ThesaurusLookupInfo, ThesaurusProviderKind } from "../../types";
import {
  ThesaurusConfigError,
  ThesaurusLookupOptions,
  ThesaurusLookupResult,
  ThesaurusProvider,
  ThesaurusRequestError
} from "./ThesaurusProvider";

type MerriamWebsterEntryMeta = {
  syns?: string[][];
  stems?: string[];
};

type MerriamWebsterEntry = {
  fl?: string;
  shortdef?: string[];
  meta?: MerriamWebsterEntryMeta;
};

function uniqueNormalized(values: string[], maxSuggestions: number): string[] {
  const accepted: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const normalized = normalizeSuggestion(trimmed);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    accepted.push(trimmed);
    if (accepted.length >= maxSuggestions) {
      break;
    }
  }

  return accepted;
}

function parseMerriamWebsterResponse(payload: unknown, maxSuggestions: number): string[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  if (payload.every((entry) => typeof entry === "string")) {
    return uniqueNormalized(payload as string[], maxSuggestions);
  }

  const collected: string[] = [];
  for (const entry of payload as MerriamWebsterEntry[]) {
    const groups = entry.meta?.syns;
    if (!Array.isArray(groups)) {
      continue;
    }

    for (const group of groups) {
      if (!Array.isArray(group)) {
        continue;
      }

      for (const value of group) {
        if (typeof value === "string") {
          collected.push(value);
        }
      }
    }
  }

  return uniqueNormalized(collected, maxSuggestions);
}

function parseMerriamWebsterResult(
  payload: unknown,
  query: string,
  maxSuggestions: number
): ThesaurusLookupResult {
  const baseInfo: ThesaurusLookupInfo = {
    provider: "Merriam-Webster",
    query,
    entryCount: 0,
    suggestionCount: 0,
    definitions: [],
    stems: [],
    didYouMean: []
  };

  if (!Array.isArray(payload)) {
    return {
      suggestions: [],
      info: baseInfo
    };
  }

  if (payload.every((entry) => typeof entry === "string")) {
    const didYouMean = uniqueNormalized(payload as string[], 6);
    return {
      suggestions: [],
      info: {
        ...baseInfo,
        didYouMean
      }
    };
  }

  const entries = payload.filter((entry): entry is MerriamWebsterEntry => typeof entry === "object" && entry !== null);
  const suggestions = parseMerriamWebsterResponse(entries, maxSuggestions);

  const first = entries[0];
  const definitions = Array.isArray(first?.shortdef)
    ? first.shortdef.filter((value): value is string => typeof value === "string").slice(0, 4)
    : [];
  const stems = Array.isArray(first?.meta?.stems)
    ? first.meta.stems.filter((value): value is string => typeof value === "string").slice(0, 6)
    : [];
  const partOfSpeech = typeof first?.fl === "string" ? first.fl : undefined;

  return {
    suggestions,
    info: {
      ...baseInfo,
      entryCount: entries.length,
      suggestionCount: suggestions.length,
      partOfSpeech,
      definitions,
      stems
    }
  };
}

/** Implements the Merriam-Webster thesaurus provider. */
export class MerriamWebsterThesaurusProvider implements ThesaurusProvider {
  public readonly kind: ThesaurusProviderKind = "merriamWebster";

  public async lookup(term: string, options: ThesaurusLookupOptions): Promise<ThesaurusLookupResult> {
    if (options.apiKey.trim().length === 0) {
      throw new ThesaurusConfigError(
        "Merriam-Webster thesaurus API key is missing. Run 'Saurus: Configure Thesaurus Provider' to store it securely."
      );
    }

    const encodedTerm = encodeURIComponent(term);
    const encodedKey = encodeURIComponent(options.apiKey.trim());
    const endpoint = `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodedTerm}?key=${encodedKey}`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new ThesaurusRequestError(
          `Thesaurus request failed (${response.status} ${response.statusText}).`
        );
      }

      const payload = await response.json();
      return parseMerriamWebsterResult(payload, term, options.maxSuggestions);
    } catch (error) {
      if (error instanceof ThesaurusRequestError || error instanceof ThesaurusConfigError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new ThesaurusRequestError(`Thesaurus request timed out after ${options.timeoutMs}ms.`);
      }

      if (error instanceof Error) {
        throw new ThesaurusRequestError(`Thesaurus request failed: ${error.message}`);
      }

      throw new ThesaurusRequestError("Thesaurus request failed unexpectedly.");
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

/** Test helpers for Merriam-Webster parsing behavior. */
export const __testOnly = {
  parseMerriamWebsterResponse,
  parseMerriamWebsterResult,
  uniqueNormalized
};
