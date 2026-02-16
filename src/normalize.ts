export function normalizeSuggestion(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeSuggestions(
  suggestions: string[],
  seenNormalized: Set<string>,
  maxCount: number
): string[] {
  const accepted: string[] = [];
  const localSeen = new Set<string>();

  for (const suggestion of suggestions) {
    const trimmed = suggestion.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const normalized = normalizeSuggestion(trimmed);
    if (normalized.length === 0) {
      continue;
    }

    if (seenNormalized.has(normalized) || localSeen.has(normalized)) {
      continue;
    }

    localSeen.add(normalized);
    accepted.push(trimmed);

    if (accepted.length >= maxCount) {
      break;
    }
  }

  return accepted;
}

export function addSuggestionsToSeen(
  suggestions: string[],
  seenNormalized: Set<string>,
  seenRaw: string[]
): void {
  for (const suggestion of suggestions) {
    const normalized = normalizeSuggestion(suggestion);
    if (normalized.length === 0 || seenNormalized.has(normalized)) {
      continue;
    }

    seenNormalized.add(normalized);
    seenRaw.push(suggestion);
  }
}
