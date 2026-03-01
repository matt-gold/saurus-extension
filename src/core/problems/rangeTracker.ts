import { ProblemIssue } from "../../types";

/** Position using 0-based line and 0-based character. */
export type ProblemPos = { line: number; character: number };

/** Minimal representation of a document text change. */
export type ProblemContentChange = {
  range: {
    start: ProblemPos;
    end: ProblemPos;
  };
  text: string;
};

/** One tracked problem span that can be updated across edits. */
export type TrackedProblemIssue = {
  id: string;
  issue: ProblemIssue;
  start: ProblemPos;
  end: ProblemPos;
  deleted: boolean;
  dirty: boolean;
};

/**
 * Tracks problem spans across document edits so underlines and hover anchors
 * stay stable while the user types.
 */
export class ProblemRangeTracker {
  private readonly tracked = new Map<string, TrackedProblemIssue[]>();

  public load(uri: string, issues: TrackedProblemIssue[]): void {
    this.tracked.set(
      uri,
      issues.map((issue) => ({
        ...issue,
        start: { ...issue.start },
        end: { ...issue.end },
        deleted: issue.deleted ?? false,
        dirty: issue.dirty ?? false
      }))
    );
  }

  public applyChanges(uri: string, contentChanges: readonly ProblemContentChange[]): void {
    const entries = this.tracked.get(uri);
    if (!entries || entries.length === 0 || contentChanges.length === 0) {
      return;
    }

    const sorted = [...contentChanges].sort((left, right) => {
      const lineDiff = right.range.start.line - left.range.start.line;
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return right.range.start.character - left.range.start.character;
    });

    for (const change of sorted) {
      for (const entry of entries) {
        if (entry.deleted) {
          continue;
        }
        applyChangeToTrackedIssue(entry, change);
      }
    }
  }

  public removeIssue(uri: string, issueId: string): void {
    const entries = this.tracked.get(uri);
    if (!entries) {
      return;
    }

    const filtered = entries.filter((entry) => entry.id !== issueId);
    this.tracked.set(uri, filtered);
  }

  public getTracked(uri: string): TrackedProblemIssue[] | undefined {
    return this.tracked.get(uri);
  }

  public clear(uri: string): void {
    this.tracked.delete(uri);
  }

  public clearAll(): void {
    this.tracked.clear();
  }
}

function posIsBefore(left: ProblemPos, right: ProblemPos): boolean {
  return left.line < right.line || (left.line === right.line && left.character < right.character);
}

function posIsBeforeOrEqual(left: ProblemPos, right: ProblemPos): boolean {
  return left.line < right.line || (left.line === right.line && left.character <= right.character);
}

/** Computes end position after inserting `text` at `start`. */
export function computeInsertEnd(start: ProblemPos, text: string): ProblemPos {
  const lines = text.split("\n");
  if (lines.length === 1) {
    return { line: start.line, character: start.character + lines[0].length };
  }

  return {
    line: start.line + lines.length - 1,
    character: lines[lines.length - 1].length
  };
}

/** Shifts a position that is known to be after a replaced range. */
export function shiftPosition(position: ProblemPos, changeEnd: ProblemPos, insertEnd: ProblemPos): ProblemPos {
  const lineDelta = insertEnd.line - changeEnd.line;

  if (position.line > changeEnd.line) {
    return {
      line: position.line + lineDelta,
      character: position.character
    };
  }

  const charDelta = insertEnd.character - changeEnd.character;
  return {
    line: position.line + lineDelta,
    character: position.character + charDelta
  };
}

/** Applies one text change to one tracked problem range. */
export function applyChangeToTrackedIssue(entry: TrackedProblemIssue, change: ProblemContentChange): void {
  const changeStart = change.range.start;
  const changeEnd = change.range.end;
  const insertEnd = computeInsertEnd(changeStart, change.text);

  if (posIsBeforeOrEqual(entry.end, changeStart)) {
    return;
  }

  if (posIsBeforeOrEqual(changeEnd, entry.start)) {
    entry.start = shiftPosition(entry.start, changeEnd, insertEnd);
    entry.end = shiftPosition(entry.end, changeEnd, insertEnd);
    entry.dirty = true;
    return;
  }

  if (posIsBeforeOrEqual(changeStart, entry.start) && posIsBeforeOrEqual(entry.end, changeEnd)) {
    if (change.text.trim().length === 0) {
      entry.deleted = true;
      entry.dirty = true;
      return;
    }

    entry.start = { ...changeStart };
    entry.end = { ...insertEnd };
    entry.dirty = true;
    return;
  }

  if (posIsBefore(changeStart, entry.start) && posIsBefore(changeEnd, entry.end)) {
    entry.start = { ...insertEnd };
    entry.end = shiftPosition(entry.end, changeEnd, insertEnd);
    entry.dirty = true;
    return;
  }

  if (posIsBefore(entry.start, changeStart) && posIsBefore(entry.end, changeEnd)) {
    entry.end = { ...insertEnd };
    entry.dirty = true;
    return;
  }

  if (posIsBeforeOrEqual(entry.start, changeStart) && posIsBeforeOrEqual(changeEnd, entry.end)) {
    entry.end = shiftPosition(entry.end, changeEnd, insertEnd);
    entry.dirty = true;
  }
}
