/** Variables used to render the problem-finder prompt template. */
export type ProblemPromptVariables = {
  targetText: string;
  contextLeft: string;
  contextRight: string;
  issueCount: number;
  fileName: string;
  languageId: string;
  scope: "selection" | "file";
};

/** Renders problem-finder prompt template variables for one request. */
export function renderProblemPromptTemplate(template: string, variables: ProblemPromptVariables): string {
  const valueMap: Record<string, string> = {
    targetText: variables.targetText,
    contextLeft: variables.contextLeft,
    contextRight: variables.contextRight,
    contextBefore: variables.contextLeft,
    contextAfter: variables.contextRight,
    issueCount: String(variables.issueCount),
    fileName: variables.fileName,
    languageId: variables.languageId,
    scope: variables.scope
  };

  return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    return key in valueMap ? valueMap[key] : match;
  });
}
