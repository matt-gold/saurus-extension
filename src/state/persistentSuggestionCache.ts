import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";
import { SuggestionCacheEntry, SuggestionKey } from "../types";

type PersistedSuggestionCacheEntryV1 = {
  suggestions: string[];
  lastPrompt?: string;
  lastModel?: string;
  loadedCount?: number;
  lastAddedCount?: number;
  lastResponseCached?: boolean;
  seenNormalized: string[];
  seenRaw: string[];
  createdAt: number;
  documentVersion: number;
  documentUri: string;
  lastAccessedAt?: number;
};

type PersistedCacheItemV1 = {
  key: SuggestionKey;
  entry: PersistedSuggestionCacheEntryV1;
};

/** Describes the v1 on-disk format for persisted suggestion cache data. */
export type PersistedCacheFileV1 = {
  version: 1;
  savedAt: number;
  entries: PersistedCacheItemV1[];
};

/** Serializes an in-memory cache entry for persistence. */
export function serializeEntry(entry: SuggestionCacheEntry): PersistedSuggestionCacheEntryV1 {
  return {
    suggestions: [...entry.suggestions],
    lastPrompt: entry.lastPrompt,
    lastModel: entry.lastModel,
    loadedCount: entry.loadedCount,
    lastAddedCount: entry.lastAddedCount,
    lastResponseCached: entry.lastResponseCached,
    seenNormalized: [...entry.seenNormalized],
    seenRaw: [...entry.seenRaw],
    createdAt: entry.createdAt,
    documentVersion: entry.documentVersion,
    documentUri: entry.documentUri,
    lastAccessedAt: entry.lastAccessedAt
  };
}

/** Deserializes a persisted cache entry into the runtime shape. */
export function deserializeEntry(value: PersistedSuggestionCacheEntryV1): SuggestionCacheEntry {
  const suggestions = Array.isArray(value.suggestions) ? value.suggestions : [];
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : Date.now();
  const lastAccessedAt = typeof value.lastAccessedAt === "number" ? value.lastAccessedAt : createdAt;

  return {
    suggestions,
    lastPrompt: typeof value.lastPrompt === "string" ? value.lastPrompt : undefined,
    lastModel: typeof value.lastModel === "string" ? value.lastModel : undefined,
    loadedCount: typeof value.loadedCount === "number" ? value.loadedCount : suggestions.length,
    lastAddedCount: typeof value.lastAddedCount === "number" ? value.lastAddedCount : 0,
    lastResponseCached: typeof value.lastResponseCached === "boolean" ? value.lastResponseCached : true,
    seenNormalized: new Set<string>(Array.isArray(value.seenNormalized) ? value.seenNormalized : []),
    seenRaw: Array.isArray(value.seenRaw) ? value.seenRaw : [],
    createdAt,
    documentVersion: typeof value.documentVersion === "number" ? value.documentVersion : 0,
    documentUri: typeof value.documentUri === "string" ? value.documentUri : "",
    lastAccessedAt
  };
}

/** Drops persisted entries whose last access time is outside the TTL window. */
export function pruneExpiredEntries(
  entries: Map<SuggestionKey, SuggestionCacheEntry>,
  ttlMs: number,
  now = Date.now()
): Map<SuggestionKey, SuggestionCacheEntry> {
  const minAccessTime = now - ttlMs;
  const pruned = new Map<SuggestionKey, SuggestionCacheEntry>();

  for (const [key, entry] of entries.entries()) {
    const accessedAt = typeof entry.lastAccessedAt === "number" ? entry.lastAccessedAt : entry.createdAt;
    if (accessedAt < minAccessTime) {
      continue;
    }
    pruned.set(key, entry);
  }

  return pruned;
}

/** Loads persisted cache data from disk. */
export function loadPersistedCache(
  filePath: string,
  ttlMs: number,
  now = Date.now()
): Map<SuggestionKey, SuggestionCacheEntry> {
  if (!fs.existsSync(filePath)) {
    return new Map<SuggestionKey, SuggestionCacheEntry>();
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedCacheFileV1>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return new Map<SuggestionKey, SuggestionCacheEntry>();
    }

    const hydrated = new Map<SuggestionKey, SuggestionCacheEntry>();
    for (const item of parsed.entries) {
      if (!item || typeof item.key !== "string" || !item.entry) {
        continue;
      }

      const entry = deserializeEntry(item.entry);
      if (entry.documentUri.length === 0) {
        continue;
      }

      hydrated.set(item.key, entry);
    }

    return pruneExpiredEntries(hydrated, ttlMs, now);
  } catch {
    return new Map<SuggestionKey, SuggestionCacheEntry>();
  }
}

/** Saves cache data to disk. */
export async function savePersistedCache(
  filePath: string,
  entries: Map<SuggestionKey, SuggestionCacheEntry>
): Promise<void> {
  const serializableEntries: PersistedCacheItemV1[] = [];

  for (const [key, entry] of entries.entries()) {
    if (entry.suggestions.length === 0) {
      continue;
    }
    serializableEntries.push({
      key,
      entry: serializeEntry(entry)
    });
  }

  const payload: PersistedCacheFileV1 = {
    version: 1,
    savedAt: Date.now(),
    entries: serializableEntries
  };

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** Deletes the persisted cache file. */
export async function deletePersistedCache(filePath: string): Promise<void> {
  await fsp.rm(filePath, { force: true });
}
