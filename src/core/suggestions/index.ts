export { extractContextFromDocument, extractContextFromText } from "./contextWindow";
export {
  addSuggestionsToSeen,
  dedupeSuggestions,
  normalizeSuggestion
} from "./normalizeSuggestions";
export {
  appendDirectionGuidance,
  formatAvoidSuggestions,
  hashText,
  renderPromptTemplate,
  toPromptVariables
} from "./promptTemplate";
export type { PromptTemplateVariables } from "./promptTemplate";
export { parsePlaceholderContent } from "../placeholder";
export {
  buildSuggestionSemanticCacheKey,
  normalizeAiAdjacentContext
} from "./suggestionKeys";
export type { SuggestionSemanticCacheKeyInput } from "./suggestionKeys";
