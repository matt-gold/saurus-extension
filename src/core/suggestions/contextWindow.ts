import * as vscode from "vscode";
import { BuildContextResult } from "../../types";

/** Extracts context from text. */
export function extractContextFromText(
  text: string,
  startOffset: number,
  endOffset: number,
  charsBefore: number,
  charsAfter: number
): BuildContextResult {
  const safeStart = Math.max(0, Math.min(startOffset, text.length));
  const safeEnd = Math.max(safeStart, Math.min(endOffset, text.length));

  const beforeStart = Math.max(0, safeStart - Math.max(0, charsBefore));
  const afterEnd = Math.min(text.length, safeEnd + Math.max(0, charsAfter));

  return {
    contextBefore: text.slice(beforeStart, safeStart),
    contextAfter: text.slice(safeEnd, afterEnd),
    startOffset: safeStart,
    endOffset: safeEnd
  };
}

/** Extracts document context around a placeholder selection. */
export function extractContextFromDocument(
  document: vscode.TextDocument,
  range: vscode.Range,
  charsBefore: number,
  charsAfter: number
): BuildContextResult {
  const fullText = document.getText();
  const startOffset = document.offsetAt(range.start);
  const endOffset = document.offsetAt(range.end);

  return extractContextFromText(fullText, startOffset, endOffset, charsBefore, charsAfter);
}
