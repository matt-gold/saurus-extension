import {
  GenerationState,
  SourceGenerationStates,
  SuggestionCacheEntry,
  SuggestionKey,
  SuggestionSource
} from "./types";

const DEFAULT_SOURCE_STATES: SourceGenerationStates = {
  thesaurus: "idle",
  ai: "idle"
};

export class SuggestionCache {
  private readonly entries = new Map<SuggestionKey, SuggestionCacheEntry>();
  private readonly sourceStates = new Map<SuggestionKey, SourceGenerationStates>();
  private readonly keyToUri = new Map<SuggestionKey, string>();
  private readonly inFlight = new Map<SuggestionKey, Promise<unknown>>();

  public getEntry(key: SuggestionKey): SuggestionCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      entry.lastAccessedAt = Date.now();
    }
    return entry;
  }

  public setEntry(key: SuggestionKey, entry: SuggestionCacheEntry): void {
    if (!entry.lastAccessedAt) {
      entry.lastAccessedAt = Date.now();
    }
    this.entries.set(key, entry);
    this.keyToUri.set(key, entry.documentUri);
  }

  public setEntries(entries: Map<SuggestionKey, SuggestionCacheEntry>): void {
    for (const [key, entry] of entries.entries()) {
      this.setEntry(key, entry);
    }
  }

  public listEntries(): Map<SuggestionKey, SuggestionCacheEntry> {
    return new Map(this.entries);
  }

  public deleteEntry(key: SuggestionKey): void {
    this.entries.delete(key);
    this.sourceStates.delete(key);
    this.keyToUri.delete(key);
  }

  public getSourceStates(key: SuggestionKey): SourceGenerationStates {
    return this.sourceStates.get(key) ?? DEFAULT_SOURCE_STATES;
  }

  public getSourceState(key: SuggestionKey, source: SuggestionSource): GenerationState {
    return this.getSourceStates(key)[source];
  }

  public setSourceState(
    key: SuggestionKey,
    source: SuggestionSource,
    state: GenerationState,
    documentUri?: string
  ): void {
    const next: SourceGenerationStates = {
      ...this.getSourceStates(key),
      [source]: state
    };
    this.sourceStates.set(key, next);

    if (documentUri) {
      this.keyToUri.set(key, documentUri);
    }
  }

  public clearDocument(documentUri: string): void {
    for (const [key, uri] of this.keyToUri.entries()) {
      if (uri !== documentUri) {
        continue;
      }

      this.entries.delete(key);
      this.sourceStates.delete(key);
      this.keyToUri.delete(key);
      this.inFlight.delete(key);
    }
  }

  public clearAll(): void {
    this.entries.clear();
    this.sourceStates.clear();
    this.keyToUri.clear();
    this.inFlight.clear();
  }

  public hasEntry(key: SuggestionKey): boolean {
    return this.entries.has(key);
  }

  public hasInFlight(key: SuggestionKey): boolean {
    return this.inFlight.has(key);
  }

  public async runExclusive<T>(key: SuggestionKey, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = task().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}
