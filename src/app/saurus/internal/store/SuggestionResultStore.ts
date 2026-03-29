import * as vscode from "vscode";
import { SaurusSettings, SuggestionCacheEntry } from "../../../../types";
import { addSuggestionsToSeen } from "../../../../core/suggestions";
import {
  SuggestionCache,
  deletePersistedCache,
  loadPersistedCache,
  pruneExpiredEntries,
  savePersistedCache
} from "../../../../state";

const PERSIST_SAVE_DEBOUNCE_MS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Represents a cached suggestion result keyed by semantic request context. */
export type SuggestionSemanticCacheEntry = {
  options: string[];
  lastPrompt?: string;
  lastModel?: string;
};

type SuggestionResultStoreDeps = {
  persistentCachePath: string;
  getSettings: () => SaurusSettings;
  notifyChange: () => void;
};

/** Owns suggestion session state, semantic cache, and persistence. */
export class SuggestionResultStore implements vscode.Disposable {
  private readonly cache = new SuggestionCache();
  private readonly semanticSuggestionCache = new Map<string, SuggestionSemanticCacheEntry>();
  private persistSaveTimer: NodeJS.Timeout | undefined;
  private persistSaveInFlight = false;
  private persistSaveQueued = false;

  public constructor(private readonly deps: SuggestionResultStoreDeps) {}

  public initialize(): void {
    const settings = this.deps.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    const ttlMs = settings.cachePersistTtlDays * DAY_MS;
    const persistedEntries = loadPersistedCache(this.deps.persistentCachePath, ttlMs);
    if (persistedEntries.size === 0) {
      return;
    }

    this.cache.setEntries(persistedEntries);
    for (const [key, entry] of persistedEntries.entries()) {
      this.cache.setSourceState(key, "ai", entry.suggestions.length > 0 ? "ready" : "idle", entry.documentUri);
    }
    this.deps.notifyChange();
  }

  public dispose(): void {
    this.cancelPendingSave();
    void this.flush();
  }

  public getSessionEntry(key: string): SuggestionCacheEntry | undefined {
    return this.cache.getEntry(key);
  }

  public getSourceStates(key: string) {
    return this.cache.getSourceStates(key);
  }

  public getSourceState(key: string, source: "ai") {
    return this.cache.getSourceState(key, source);
  }

  public hasInFlight(key: string): boolean {
    return this.cache.hasInFlight(key);
  }

  public hasEntry(key: string): boolean {
    return this.cache.hasEntry(key);
  }

  public hydrateFromSemanticCache(
    key: string,
    semanticKey: string,
    document: vscode.TextDocument,
    existingEntry?: SuggestionCacheEntry
  ): SuggestionCacheEntry | undefined {
    const semantic = this.semanticSuggestionCache.get(semanticKey);
    if (!existingEntry && !semantic) {
      return undefined;
    }

    let nextEntry = existingEntry
      ? {
        ...existingEntry,
        suggestions: [...existingEntry.suggestions],
        seenNormalized: new Set<string>(existingEntry.seenNormalized),
        seenRaw: [...existingEntry.seenRaw]
      }
      : this.createEntry(document);
    let changed = !existingEntry;

    if (semantic && nextEntry.suggestions.length === 0) {
      nextEntry = {
        ...nextEntry,
        suggestions: [...semantic.options],
        lastPrompt: semantic.lastPrompt,
        lastModel: semantic.lastModel,
        loadedCount: semantic.options.length,
        lastAddedCount: 0,
        lastResponseCached: true
      };
      changed = true;
    }

    if (!changed) {
      return existingEntry;
    }

    const seenNormalized = new Set<string>();
    const seenRaw: string[] = [];
    addSuggestionsToSeen(nextEntry.suggestions, seenNormalized, seenRaw);
    const hydrated = {
      ...nextEntry,
      seenNormalized,
      seenRaw,
      lastAccessedAt: Date.now()
    };

    this.cache.setEntry(key, hydrated);
    return hydrated;
  }

  public markGenerating(key: string, documentUri: string): void {
    this.cache.setSourceState(key, "ai", "generating", documentUri);
    this.deps.notifyChange();
  }

  public markIdle(key: string, documentUri: string): void {
    this.cache.setSourceState(key, "ai", "idle", documentUri);
    this.deps.notifyChange();
  }

  public markReady(key: string, entry: SuggestionCacheEntry, documentUri: string): void {
    this.cache.setEntry(key, entry);
    this.cache.setSourceState(key, "ai", "ready", documentUri);
    this.scheduleSave();
    this.deps.notifyChange();
  }

  public markError(key: string, entry: SuggestionCacheEntry, documentUri: string): void {
    this.cache.setEntry(key, entry);
    this.cache.setSourceState(key, "ai", entry.suggestions.length > 0 ? "ready" : "error", documentUri);
    this.scheduleSave();
    this.deps.notifyChange();
  }

  public runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    return this.cache.runExclusive(key, task);
  }

  public setSemanticResult(semanticKey: string, value: SuggestionSemanticCacheEntry): void {
    this.semanticSuggestionCache.set(semanticKey, value);
  }

  public getSemanticResult(semanticKey: string): SuggestionSemanticCacheEntry | undefined {
    return this.semanticSuggestionCache.get(semanticKey);
  }

  public updateEntry(key: string, entry: SuggestionCacheEntry): void {
    this.cache.setEntry(key, entry);
  }

  public createEntry(document: vscode.TextDocument, base?: Partial<SuggestionCacheEntry>): SuggestionCacheEntry {
    const now = Date.now();
    return {
      suggestions: [],
      loadedCount: 0,
      lastAddedCount: 0,
      lastResponseCached: true,
      seenNormalized: new Set<string>(),
      seenRaw: [],
      createdAt: now,
      documentVersion: document.version,
      documentUri: document.uri.toString(),
      lastAccessedAt: now,
      ...base
    };
  }

  public clearDocument(documentUri: string): void {
    this.cache.clearDocument(documentUri);
    this.scheduleSave();
    this.deps.notifyChange();
  }

  public clearAll(): void {
    this.cache.clearAll();
    this.semanticSuggestionCache.clear();
    this.cancelPendingSave();
    this.deps.notifyChange();
  }

  public async deletePersistedCacheFile(): Promise<void> {
    await deletePersistedCache(this.deps.persistentCachePath);
  }

  private cancelPendingSave(): void {
    if (!this.persistSaveTimer) {
      return;
    }

    clearTimeout(this.persistSaveTimer);
    this.persistSaveTimer = undefined;
  }

  private scheduleSave(): void {
    const settings = this.deps.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    this.cancelPendingSave();
    this.persistSaveTimer = setTimeout(() => {
      this.persistSaveTimer = undefined;
      void this.flush();
    }, PERSIST_SAVE_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    const settings = this.deps.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    if (this.persistSaveInFlight) {
      this.persistSaveQueued = true;
      return;
    }

    this.persistSaveInFlight = true;
    try {
      const ttlMs = settings.cachePersistTtlDays * DAY_MS;
      const entries = pruneExpiredEntries(this.cache.listEntries(), ttlMs);
      await savePersistedCache(this.deps.persistentCachePath, entries);
    } catch {
      // Persistence is best effort.
    } finally {
      this.persistSaveInFlight = false;
      if (this.persistSaveQueued) {
        this.persistSaveQueued = false;
        this.scheduleSave();
      }
    }
  }
}
