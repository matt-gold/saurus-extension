import { createHash } from "crypto";
import { SuggestionRequest } from "./types";

export interface PromptTemplateVariables {
  placeholder: string;
  contextBefore: string;
  contextAfter: string;
  suggestionCount: number;
  avoidSuggestions: string[];
  direction: string;
  fileName: string;
  languageId: string;
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function formatAvoidSuggestions(avoidSuggestions: string[]): string {
  if (avoidSuggestions.length === 0) {
    return "(none)";
  }

  return avoidSuggestions.map((entry) => `- ${entry}`).join("\n");
}

export function renderPromptTemplate(template: string, variables: PromptTemplateVariables): string {
  const valueMap: Record<string, string> = {
    placeholder: variables.placeholder,
    contextBefore: variables.contextBefore,
    contextAfter: variables.contextAfter,
    suggestionCount: String(variables.suggestionCount),
    avoidSuggestions: formatAvoidSuggestions(variables.avoidSuggestions),
    direction: variables.direction,
    fileName: variables.fileName,
    languageId: variables.languageId
  };

  return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    return key in valueMap ? valueMap[key] : match;
  });
}

export function toPromptVariables(request: SuggestionRequest): PromptTemplateVariables {
  return {
    placeholder: request.placeholder,
    contextBefore: request.contextBefore,
    contextAfter: request.contextAfter,
    suggestionCount: request.suggestionCount,
    avoidSuggestions: request.avoidSuggestions,
    direction: request.direction,
    fileName: request.fileName,
    languageId: request.languageId
  };
}

export function appendDirectionGuidance(prompt: string, direction: string): string {
  const normalizedDirection = direction.trim();
  if (normalizedDirection.length === 0) {
    return prompt;
  }

  return [
    prompt.trimEnd(),
    "",
    "Additional direction for this run:",
    `- ${normalizedDirection}`
  ].join("\n");
}
