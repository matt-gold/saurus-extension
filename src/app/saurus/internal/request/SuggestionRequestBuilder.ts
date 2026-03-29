import {
  appendDirectionGuidance,
  renderPromptTemplate,
  toPromptVariables
} from "../../../../core/suggestions";
import { SaurusSettings, SuggestionRequest } from "../../../../types";
import type { PlaceholderSession } from "../session";

/** Options for building a suggestion request from a placeholder session. */
export type SuggestionBuildRequestOptions = {
  forceDifferent: boolean;
  promptDirection?: string;
  userInitiated: boolean;
};

/** Fully-built request payload ready for provider execution. */
export type BuiltSuggestionRequest = {
  request: SuggestionRequest;
  renderedPrompt: string;
  effectiveDirection: string;
  requestLabel: string;
};

/** Builds normalized suggestion requests and rendered prompts from placeholder sessions. */
export class SuggestionRequestBuilder {
  public buildForDocument(
    session: PlaceholderSession,
    settings: SaurusSettings,
    document: { fileName: string; languageId: string },
    options: SuggestionBuildRequestOptions
  ): BuiltSuggestionRequest {
    const effectiveDirection = options.promptDirection?.trim() || session.parsedContent.directionText;
    if (session.parsedContent.targetText.length === 0) {
      throw new Error("Saurus: placeholder text cannot be empty before `::` prompt metadata.");
    }

    const request: SuggestionRequest = {
      placeholder: session.parsedContent.targetText,
      contextBefore: session.contextBefore,
      contextAfter: session.contextAfter,
      suggestionCount: settings.suggestionCount,
      avoidSuggestions: session.entry?.seenRaw ?? [],
      direction: effectiveDirection,
      fileName: document.fileName,
      languageId: document.languageId
    };

    return this.buildFromRequest(request, settings);
  }

  private buildFromRequest(request: SuggestionRequest, settings: SaurusSettings): BuiltSuggestionRequest {
    const renderedPrompt = appendDirectionGuidance(
      renderPromptTemplate(settings.promptTemplate, toPromptVariables(request)),
      request.direction
    );

    return {
      request,
      renderedPrompt,
      effectiveDirection: request.direction,
      requestLabel: request.placeholder
    };
  }
}
