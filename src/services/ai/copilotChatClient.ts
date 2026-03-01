import * as vscode from "vscode";
import { parseProblemFinderResponse } from "./aiProblemResponseParser";
import { parseSuggestionResponse } from "./aiResponseParser";
import {
  CopilotChatRequestError,
  CopilotChatUnavailableError,
  mapCopilotChatError,
  selectFirstCopilotModel
} from "./copilotChatCore";
import { ProblemFinderResponse, SuggestionResponse } from "../../types";

/** Options for copilot chat request. */
export type CopilotChatRequestOptions = {
    prompt: string;
    model?: string;
    timeoutMs: number;
    justification?: string;
};

async function selectCopilotChatModel(modelHint?: string): Promise<vscode.LanguageModelChat | undefined> {
  return selectFirstCopilotModel(modelHint, (selector) => vscode.lm.selectChatModels(selector));
}

/** Returns whether use copilot chat in background. */
export async function canUseCopilotChatInBackground(
  context: vscode.ExtensionContext,
  modelHint?: string
): Promise<boolean> {
  try {
    const model = await selectCopilotChatModel(modelHint);
    if (!model) {
      return false;
    }

    return context.languageModelAccessInformation.canSendRequest(model) === true;
  } catch {
    return false;
  }
}

/** Implements generate suggestions with copilot chat. */
export async function generateSuggestionsWithCopilotChat(
  options: CopilotChatRequestOptions
): Promise<SuggestionResponse> {
  const raw = await generateRawCopilotChatResponse(options);
  return parseSuggestionResponse(raw, "Copilot Chat", (message) => new CopilotChatRequestError(message));
}

/** Implements generate writing problems with copilot chat. */
export async function generateProblemsWithCopilotChat(
  options: CopilotChatRequestOptions
): Promise<ProblemFinderResponse> {
  const raw = await generateRawCopilotChatResponse(options);
  return parseProblemFinderResponse(raw, "Copilot Chat", (message) => new CopilotChatRequestError(message));
}

/** Runs one Copilot Chat request and returns raw text. */
export async function generateRawCopilotChatResponse(
  options: CopilotChatRequestOptions
): Promise<string> {
  const model = await selectCopilotChatModel(options.model);
  if (!model) {
    throw new CopilotChatUnavailableError();
  }

  const cancellationTokenSource = new vscode.CancellationTokenSource();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    cancellationTokenSource.cancel();
  }, options.timeoutMs);

  try {
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(options.prompt)],
      {
        justification: options.justification
      },
      cancellationTokenSource.token
    );

    let raw = "";
    for await (const chunk of response.text) {
      raw += chunk;
    }

    if (timedOut) {
      throw new CopilotChatRequestError(`Copilot Chat request timed out after ${options.timeoutMs}ms.`);
    }

    return raw;
  } catch (error) {
    if (timedOut) {
      throw new CopilotChatRequestError(`Copilot Chat request timed out after ${options.timeoutMs}ms.`);
    }

    throw mapCopilotChatError(error);
  } finally {
    clearTimeout(timeoutHandle);
    cancellationTokenSource.dispose();
  }
}
