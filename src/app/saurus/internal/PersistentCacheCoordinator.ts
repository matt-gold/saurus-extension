import { SaurusSettings } from "../../../types";
import {
  SuggestionCache,
  deletePersistedCache,
  loadPersistedCache,
  pruneExpiredEntries,
  savePersistedCache
} from "../../../state";

const PERSIST_SAVE_DEBOUNCE_MS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

type PersistentCacheCoordinatorDeps = {
  cache: SuggestionCache;
  persistentCachePath: string;
  getSettings: () => SaurusSettings;
  notifyCompletionItemsChanged: () => void;};

/** Coordinates cache hydration and deferred persistence for Saurus suggestions. */
export class PersistentCacheCoordinator {
  private persistSaveTimer: NodeJS.Timeout | undefined;
  private persistSaveInFlight = false;
  private persistSaveQueued = false;

  public constructor(private readonly deps: PersistentCacheCoordinatorDeps) {}

  public dispose(): void {
    this.cancelPendingSave();
    void this.flush();
  }

  public hydrate(): void {
    const settings = this.deps.getSettings();
    if (!settings.cachePersistAcrossReload) {
      return;
    }

    const ttlMs = settings.cachePersistTtlDays * DAY_MS;
    const persistedEntries = loadPersistedCache(this.deps.persistentCachePath, ttlMs);
    if (persistedEntries.size === 0) {
      return;
    }

    this.deps.cache.setEntries(persistedEntries);
    for (const [key, entry] of persistedEntries.entries()) {
      const thesaurusState = settings.thesaurusEnabled
        ? (entry.thesaurusOptions.length > 0 ? "ready" : "idle")
        : "idle";
      const aiState = entry.aiOptions.length > 0 ? "ready" : "idle";
      this.deps.cache.setSourceState(key, "thesaurus", thesaurusState, entry.documentUri);
      this.deps.cache.setSourceState(key, "ai", aiState, entry.documentUri);
    }

    this.deps.notifyCompletionItemsChanged();
  }

  public cancelPendingSave(): void {
    if (!this.persistSaveTimer) {
      return;
    }

    clearTimeout(this.persistSaveTimer);
    this.persistSaveTimer = undefined;
  }

  public scheduleSave(): void {
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

  public async flush(): Promise<void> {
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
      const entries = pruneExpiredEntries(this.deps.cache.listEntries(), ttlMs);
      await savePersistedCache(this.deps.persistentCachePath, entries);
    } catch {
      // Best effort: persistence errors should not interrupt suggestions.
    } finally {
      this.persistSaveInFlight = false;
      if (this.persistSaveQueued) {
        this.persistSaveQueued = false;
        this.scheduleSave();
      }
    }
  }

  public async deletePersistedCacheFile(): Promise<void> {
    await deletePersistedCache(this.deps.persistentCachePath);
  }
}
