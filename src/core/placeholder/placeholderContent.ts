/** Describes parsed placeholder content and optional inline prompt metadata. */
export type ParsedPlaceholderContent = {
  rawTargetText: string;
  targetText: string;
  rawDirectionText: string;
  directionText: string;
  separatorIndex: number;
  hasPrompt: boolean;
};

/** Parses `target :: direction` placeholder syntax into revision target and prompt metadata. */
export function parsePlaceholderContent(rawInnerText: string): ParsedPlaceholderContent {
  const separatorIndex = rawInnerText.indexOf("::");
  if (separatorIndex === -1) {
    return {
      rawTargetText: rawInnerText,
      targetText: rawInnerText.trim(),
      rawDirectionText: "",
      directionText: "",
      separatorIndex: -1,
      hasPrompt: false
    };
  }

  const rawTargetText = rawInnerText.slice(0, separatorIndex);
  const rawDirectionText = rawInnerText.slice(separatorIndex + 2);

  return {
    rawTargetText,
    targetText: rawTargetText.trim(),
    rawDirectionText,
    directionText: rawDirectionText.trim(),
    separatorIndex,
    hasPrompt: true
  };
}
