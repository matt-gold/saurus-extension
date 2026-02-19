import { SuggestionResponse } from "./types";

interface ParseContext {
  providerLabel: string;
  createError: (message: string) => Error;
}

function parseSuggestionJson(raw: string, context: ParseContext): SuggestionResponse | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (Array.isArray(parsed)) {
    const values = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) {
      return { suggestions: values };
    }
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { suggestions?: unknown }).suggestions)) {
    return undefined;
  }

  const suggestions = (parsed as { suggestions: unknown[] }).suggestions
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (suggestions.length === 0) {
    throw context.createError(`${context.providerLabel} returned no valid suggestions.`);
  }

  return { suggestions };
}

function extractJsonCandidate(raw: string): string | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const object = raw.match(/\{[\s\S]*\}/);
  if (object?.[0]) {
    return object[0].trim();
  }

  const array = raw.match(/\[[\s\S]*\]/);
  if (array?.[0]) {
    return array[0].trim();
  }

  return undefined;
}

export function parseSuggestionResponse(
  raw: string,
  providerLabel: string,
  createError: (message: string) => Error
): SuggestionResponse {
  const context: ParseContext = {
    providerLabel,
    createError
  };

  const fromRaw = parseSuggestionJson(raw, context);
  if (fromRaw) {
    return fromRaw;
  }

  const jsonCandidate = extractJsonCandidate(raw);
  if (jsonCandidate) {
    const fromCandidate = parseSuggestionJson(jsonCandidate, context);
    if (fromCandidate) {
      return fromCandidate;
    }
  }

  const unique = new Set<string>();
  const lineSuggestions: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const candidate = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .trim();
    if (candidate.length === 0) {
      continue;
    }

    const normalized = candidate.toLowerCase();
    if (unique.has(normalized)) {
      continue;
    }
    unique.add(normalized);
    lineSuggestions.push(candidate);
  }

  if (lineSuggestions.length > 0) {
    return { suggestions: lineSuggestions };
  }

  throw createError(`${providerLabel} returned no valid suggestions.`);
}
