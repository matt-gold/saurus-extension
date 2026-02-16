import type * as vscode from "vscode";
import { DelimiterPair, PlaceholderMatch } from "./types";

export interface LinePlaceholderMatch {
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
  rawInnerText: string;
  rawFullText: string;
}

export function findAllPlaceholdersInLine(
  lineText: string,
  open: string,
  close: string
): LinePlaceholderMatch[] {
  if (open.length === 0 || close.length === 0) {
    return [];
  }

  const matches: LinePlaceholderMatch[] = [];
  let searchFrom = 0;

  while (searchFrom < lineText.length) {
    const openIndex = lineText.indexOf(open, searchFrom);
    if (openIndex === -1) {
      break;
    }

    const closeIndex = lineText.indexOf(close, openIndex + open.length);
    if (closeIndex === -1) {
      break;
    }

    const end = closeIndex + close.length;
    matches.push({
      start: openIndex,
      end,
      innerStart: openIndex + open.length,
      innerEnd: closeIndex,
      rawInnerText: lineText.slice(openIndex + open.length, closeIndex),
      rawFullText: lineText.slice(openIndex, end)
    });

    searchFrom = end;
  }

  return matches;
}

export function findPlaceholderInLine(
  lineText: string,
  cursorChar: number,
  open: string,
  close: string
): LinePlaceholderMatch | undefined {
  const boundedCursor = Math.max(0, Math.min(cursorChar, lineText.length));
  const matches = findAllPlaceholdersInLine(lineText, open, close);
  for (const match of matches) {
    if (boundedCursor >= match.start && boundedCursor <= match.end) {
      return match;
    }
  }

  return undefined;
}

export function findPlaceholderAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  delimiters: DelimiterPair
): PlaceholderMatch | undefined {
  const vscodeLib = require("vscode") as typeof import("vscode");
  const line = document.lineAt(position.line);
  const lineMatch = findPlaceholderInLine(line.text, position.character, delimiters.open, delimiters.close);
  if (!lineMatch) {
    return undefined;
  }

  const fullStart = new vscodeLib.Position(position.line, lineMatch.start);
  const fullEnd = new vscodeLib.Position(position.line, lineMatch.end);
  const innerStart = new vscodeLib.Position(position.line, lineMatch.innerStart);
  const innerEnd = new vscodeLib.Position(position.line, lineMatch.innerEnd);

  return {
    fullRange: new vscodeLib.Range(fullStart, fullEnd),
    innerRange: new vscodeLib.Range(innerStart, innerEnd),
    rawInnerText: lineMatch.rawInnerText,
    rawFullText: lineMatch.rawFullText,
    open: delimiters.open,
    close: delimiters.close
  };
}
