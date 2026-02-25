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
export { extractThesaurusLookupTerm } from "./thesaurusLookupTerm";
export {
  buildAiSemanticCacheKey,
  buildThesaurusSemanticCacheKey,
  normalizeAiAdjacentContext
} from "./suggestionKeys";
export type {
  AiSemanticCacheKeyInput,
  ThesaurusSemanticCacheKeyInput
} from "./suggestionKeys";
