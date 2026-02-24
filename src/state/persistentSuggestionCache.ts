import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";
import { SuggestionCacheEntry, SuggestionKey } from "../types";

type PersistedSuggestionCacheEntryV1 = {
    thesaurusOptions: string[];
    aiOptions: string[];
    thesaurusInfo?: SuggestionCacheEntry["thesaurusInfo"];
    thesaurusLastResponseCached?: boolean;
    lastAiPrompt?: string;
    lastAiModel?: string;
    aiLoadedCount?: number;
    aiLastAddedCount?: number;
    aiLastResponseCached?: boolean;
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
/** Describes the v1 on-disk format for persisted suggestion cache data. */
export type PersistedCacheFileV1 = {
    version: 1;
    savedAt: number;
    entries: PersistedCacheItemV1[];
};

/** Implements serialize entry. */
export function serializeEntry(entry: SuggestionCacheEntry): PersistedSuggestionCacheEntryV1 {
  return {
    thesaurusOptions: [...entry.thesaurusOptions],
    aiOptions: [...entry.aiOptions],
    thesaurusInfo: entry.thesaurusInfo,
    thesaurusLastResponseCached: entry.thesaurusLastResponseCached,
    lastAiPrompt: entry.lastAiPrompt,
    lastAiModel: entry.lastAiModel,
    aiLoadedCount: entry.aiLoadedCount,
    aiLastAddedCount: entry.aiLastAddedCount,
    aiLastResponseCached: entry.aiLastResponseCached,
    seenNormalized: [...entry.seenNormalized],
    seenRaw: [...entry.seenRaw],
    createdAt: entry.createdAt,
    documentVersion: entry.documentVersion,
    documentUri: entry.documentUri,
    lastAccessedAt: entry.lastAccessedAt
  };
}

/** Implements deserialize entry. */
export function deserializeEntry(value: PersistedSuggestionCacheEntryV1): SuggestionCacheEntry {
  const thesaurusOptions = Array.isArray(value.thesaurusOptions) ? value.thesaurusOptions : [];
  const aiOptions = Array.isArray(value.aiOptions) ? value.aiOptions : [];
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : Date.now();
  const lastAccessedAt = typeof value.lastAccessedAt === "number" ? value.lastAccessedAt : createdAt;

  return {
    thesaurusOptions,
    aiOptions,
    thesaurusInfo: value.thesaurusInfo,
    thesaurusLastResponseCached: typeof value.thesaurusLastResponseCached === "boolean"
      ? value.thesaurusLastResponseCached
      : true,
    lastAiPrompt: typeof value.lastAiPrompt === "string" ? value.lastAiPrompt : undefined,
    lastAiModel: typeof value.lastAiModel === "string" ? value.lastAiModel : undefined,
    aiLoadedCount: typeof value.aiLoadedCount === "number" ? value.aiLoadedCount : aiOptions.length,
    aiLastAddedCount: typeof value.aiLastAddedCount === "number" ? value.aiLastAddedCount : 0,
    aiLastResponseCached: typeof value.aiLastResponseCached === "boolean" ? value.aiLastResponseCached : true,
    seenNormalized: new Set<string>(Array.isArray(value.seenNormalized) ? value.seenNormalized : []),
    seenRaw: Array.isArray(value.seenRaw) ? value.seenRaw : [],
    createdAt,
    documentVersion: typeof value.documentVersion === "number" ? value.documentVersion : 0,
    documentUri: typeof value.documentUri === "string" ? value.documentUri : "",
    lastAccessedAt
  };
}

/** Implements prune expired entries. */
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

/** Loads persisted cache. */
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

/** Saves persisted cache. */
export async function savePersistedCache(
  filePath: string,
  entries: Map<SuggestionKey, SuggestionCacheEntry>
): Promise<void> {
  const serializableEntries: PersistedCacheItemV1[] = [];

  for (const [key, entry] of entries.entries()) {
    if (entry.thesaurusOptions.length === 0 && entry.aiOptions.length === 0) {
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

/** Implements delete persisted cache. */
export async function deletePersistedCache(filePath: string): Promise<void> {
  await fsp.rm(filePath, { force: true });
}
