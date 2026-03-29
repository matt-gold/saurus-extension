import * as vscode from "vscode";
import {
  buildSuggestionSemanticCacheKey,
  extractContextFromDocument,
  hashText,
  normalizeAiAdjacentContext,
  parsePlaceholderContent
} from "../../../../core/suggestions";
import { findPlaceholderAtPosition } from "../../../../core/placeholder";
import { getAiProviderLabel } from "../../../../services/ai";
import { SaurusSettings } from "../../../../types";
import type { PlaceholderSession } from "./PlaceholderSession";
import type { SuggestionResultStore } from "../store";

const EMPTY_SUGGESTIONS: string[] = [];

type PlaceholderSessionFactoryDeps = {
  getSettings: (document?: vscode.TextDocument) => SaurusSettings;
  store: SuggestionResultStore;
};

/** Resolves the current placeholder session from a document position. */
export class PlaceholderSessionFactory {
  public constructor(private readonly deps: PlaceholderSessionFactoryDeps) {}

  public getSession(document: vscode.TextDocument, position: vscode.Position): PlaceholderSession | undefined {
    const settings = this.deps.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      return undefined;
    }

    const match = findPlaceholderAtPosition(document, position, settings.delimiters);
    if (!match) {
      return undefined;
    }

    const parsedContent = parsePlaceholderContent(match.rawInnerText);
    const context = extractContextFromDocument(
      document,
      match.fullRange,
      settings.contextCharsBefore,
      settings.contextCharsAfter
    );
    const promptTemplateHash = hashText(settings.promptTemplate);
    const aiPathForKey = settings.aiProvider === "copilotChat" ? "" : settings.aiPath;
    const contextBefore = normalizeAiAdjacentContext(context.contextBefore, settings.delimiters);
    const contextAfter = normalizeAiAdjacentContext(context.contextAfter, settings.delimiters);
    const payload = JSON.stringify({
      uri: document.uri.toString(),
      line: match.fullRange.start.line,
      startCharacter: match.fullRange.start.character,
      endCharacter: match.fullRange.end.character,
      placeholder: parsedContent.targetText,
      direction: parsedContent.directionText,
      contextBefore,
      contextAfter,
      open: settings.delimiters.open,
      close: settings.delimiters.close,
      aiProvider: settings.aiProvider,
      aiPath: aiPathForKey,
      aiModel: settings.aiModel ?? "",
      aiReasoningEffort: settings.aiReasoningEffort,
      promptTemplateHash
    });

    const key = `${document.uri.toString()}::${hashText(payload)}`;
    const semanticKey = buildSuggestionSemanticCacheKey({
      placeholder: parsedContent.targetText,
      direction: parsedContent.directionText,
      contextBefore,
      contextAfter,
      aiProvider: settings.aiProvider,
      aiPath: aiPathForKey,
      aiModel: settings.aiModel,
      aiReasoningEffort: settings.aiReasoningEffort,
      promptTemplateHash
    });

    const entry = this.deps.store.hydrateFromSemanticCache(
      key,
      semanticKey,
      document,
      this.deps.store.getSessionEntry(key)
    );
    const sourceStates = this.deps.store.getSourceStates(key);
    const suggestions = entry?.suggestions ?? EMPTY_SUGGESTIONS;

    return {
      key,
      semanticKey,
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      match,
      parsedContent,
      contextBefore,
      contextAfter,
      providerLabel: getAiProviderLabel(settings.aiProvider),
      configuredModel: settings.aiModel,
      entry,
      sourceStates,
      isGenerating: sourceStates.ai === "generating",
      hasSuggestions: suggestions.length > 0
    };
  }
}
