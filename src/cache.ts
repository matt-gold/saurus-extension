import { GenerationState, SuggestionCacheEntry, SuggestionKey } from "./types";

export class SuggestionCache {
  private readonly entries = new Map<SuggestionKey, SuggestionCacheEntry>();
  private readonly states = new Map<SuggestionKey, GenerationState>();
  private readonly keyToUri = new Map<SuggestionKey, string>();
  private readonly inFlight = new Map<SuggestionKey, Promise<unknown>>();

  public getEntry(key: SuggestionKey): SuggestionCacheEntry | undefined {
    return this.entries.get(key);
  }

  public setEntry(key: SuggestionKey, entry: SuggestionCacheEntry): void {
    this.entries.set(key, entry);
    this.keyToUri.set(key, entry.documentUri);
    this.states.set(key, "ready");
  }

  public deleteEntry(key: SuggestionKey): void {
    this.entries.delete(key);
    this.states.delete(key);
    this.keyToUri.delete(key);
  }

  public getState(key: SuggestionKey): GenerationState {
    return this.states.get(key) ?? "idle";
  }

  public setState(key: SuggestionKey, state: GenerationState, documentUri?: string): void {
    this.states.set(key, state);
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
      this.states.delete(key);
      this.keyToUri.delete(key);
      this.inFlight.delete(key);
    }
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
