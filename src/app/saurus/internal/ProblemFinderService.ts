import * as path from "path";
import * as vscode from "vscode";
import {
  ProblemContentChange,
  ProblemRangeTracker,
  TrackedProblemIssue,
  renderProblemPromptTemplate,
  resolveProblemIssueRanges
} from "../../../core/problems";
import { extractContextFromDocument, hashText } from "../../../core/suggestions";
import {
  AiAuthError,
  AiCliMissingError,
  AiRequestError,
  CopilotChatBlockedError,
  CopilotChatConsentRequiredError,
  CopilotChatRequestError,
  CopilotChatUnavailableError,
  createAiSuggestionProvider
} from "../../../services/ai";
import { ProblemIssue, SaurusSettings } from "../../../types";

type ProblemFinderServiceDeps = {
  problemFinderSchemaPath: string;
  getSettings: (document?: vscode.TextDocument) => SaurusSettings;
};

type HoverProblemEntry = {
  id: string;
  issue: ProblemIssue;
  range: vscode.Range;
};

type DiagnoseRunResult = {
  trackedIssues: TrackedProblemIssue[];
  skippedFindings: number;
};

const PROBLEM_FINDER_TARGET_CHAR_CAP = 12000;
const IGNORE_PROBLEM_COMMAND = "saurus.ignoreProblem";
const PROBLEM_FINDER_IN_PROGRESS_MESSAGE = "Saurus: diagnosis already in progress. Please wait for it to finish.";
const CLOSE_HOVER_COMMAND = "editor.action.closeHover";

const HIGH_SEVERITY_UNDERLINE_COLOR = "rgba(239, 68, 68, 0.95)";
const MEDIUM_SEVERITY_UNDERLINE_COLOR = "rgba(245, 158, 11, 0.95)";
const LOW_SEVERITY_UNDERLINE_COLOR = "rgba(59, 130, 246, 0.95)";

/** Finds writing problems via AI and renders tracked hover decorations. */
export class ProblemFinderService implements vscode.Disposable {
  private inFlight = false;
  private readonly tracker = new ProblemRangeTracker();
  private readonly highSeverityDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: `underline wavy ${HIGH_SEVERITY_UNDERLINE_COLOR}`,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly mediumSeverityDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: `underline wavy ${MEDIUM_SEVERITY_UNDERLINE_COLOR}`,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly lowSeverityDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: `underline dotted ${LOW_SEVERITY_UNDERLINE_COLOR}`,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  public constructor(private readonly deps: ProblemFinderServiceDeps) {}

  public dispose(): void {
    this.clearAllDecorations();
    this.tracker.clearAll();
    this.highSeverityDecoration.dispose();
    this.mediumSeverityDecoration.dispose();
    this.lowSeverityDecoration.dispose();
  }

  public clearProblemsForDocument(document: vscode.TextDocument): void {
    this.tracker.clear(document.uri.toString());
    this.clearDecorationsForDocument(document);
  }

  public applyDocumentChanges(
    document: vscode.TextDocument,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ): void {
    const uri = document.uri.toString();
    if (!this.tracker.getTracked(uri) || contentChanges.length === 0) {
      return;
    }

    const normalizedChanges: ProblemContentChange[] = contentChanges.map((change) => ({
      range: {
        start: {
          line: change.range.start.line,
          character: change.range.start.character
        },
        end: {
          line: change.range.end.line,
          character: change.range.end.character
        }
      },
      text: change.text
    }));

    this.tracker.applyChanges(uri, normalizedChanges);
    this.refreshDocumentDecorations(document);
  }

  public refreshEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    this.renderEditorDecorations(editor);
  }

  public refreshVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.renderEditorDecorations(editor);
    }
  }

  public ignoreProblem(uriString?: string, problemId?: string): void {
    if (!uriString || !problemId) {
      return;
    }

    this.tracker.removeIssue(uriString, problemId);
    const document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uriString);
    if (document) {
      this.refreshDocumentDecorations(document);
    } else {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === uriString) {
          this.renderEditorDecorations(editor);
        }
      }
    }

    void vscode.commands.executeCommand(CLOSE_HOVER_COMMAND).then(undefined, () => undefined);
  }

  public async findProblems(editor: vscode.TextEditor): Promise<void> {
    if (this.inFlight) {
      void vscode.window.showInformationMessage(PROBLEM_FINDER_IN_PROGRESS_MESSAGE);
      return;
    }

    let rerunRequested = false;
    this.inFlight = true;
    try {
      const document = editor.document;
      const settings = this.deps.getSettings(document);

      if (!settings.enabled || !settings.languages.includes(document.languageId)) {
        void vscode.window.showInformationMessage("Saurus: enabled languages/settings do not allow analysis for this file.");
        return;
      }

      const selectedRange = new vscode.Range(editor.selection.start, editor.selection.end);
      const hasSelection = !editor.selection.isEmpty;
      const scope: "selection" | "file" = hasSelection ? "selection" : "file";
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
      const initialTargetRange = hasSelection ? selectedRange : fullRange;
      const initialTargetText = document.getText(initialTargetRange);
      if (hasSelection && initialTargetText.trim().length === 0) {
        void vscode.window.showInformationMessage("Saurus: selected text is empty.");
        return;
      }

      const autoIssueCount = deriveIssueCountFromText(initialTargetText, scope, settings.problemFinderMaxIssues);
      let issueCountForRun = autoIssueCount;
      if (!hasSelection) {
        const decision = await this.confirmFullFileDiagnosis(document, autoIssueCount, settings.problemFinderMaxIssues);
        if (!decision.confirmed) {
          void vscode.window.showInformationMessage("Saurus: diagnosis canceled.");
          return;
        }

        issueCountForRun = decision.issueCountOverride ?? autoIssueCount;
      }

      const targetStartDocOffset = document.offsetAt(initialTargetRange.start);
      const truncated = initialTargetText.length > PROBLEM_FINDER_TARGET_CHAR_CAP;
      const analyzedText = truncated
        ? initialTargetText.slice(0, PROBLEM_FINDER_TARGET_CHAR_CAP)
        : initialTargetText;
      const analyzedRange = truncated
        ? new vscode.Range(
          initialTargetRange.start,
          document.positionAt(targetStartDocOffset + analyzedText.length)
        )
        : initialTargetRange;

      if (truncated) {
        void vscode.window.showInformationMessage(
          `Saurus: analysis input was truncated to ${PROBLEM_FINDER_TARGET_CHAR_CAP} characters.`
        );
      }

      const surroundingContext = hasSelection
        ? extractContextFromDocument(
          document,
          selectedRange,
          settings.contextCharsBefore,
          settings.contextCharsAfter
        )
        : {
          contextBefore: "",
          contextAfter: ""
        };

      const prompt = renderProblemPromptTemplate(settings.problemFinderPromptTemplate, {
        targetText: analyzedText,
        contextLeft: surroundingContext.contextBefore,
        contextRight: surroundingContext.contextAfter,
        issueCount: issueCountForRun,
        fileName: path.basename(document.fileName),
        languageId: document.languageId,
        scope
      });
      const initialVersion = document.version;

      try {
        const result = await vscode.window.withProgress<DiagnoseRunResult>(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Saurus",
            cancellable: false
          },
          async (progress) => {
            progress.report({ message: "Diagnosing writing problems..." });

            const provider = createAiSuggestionProvider(settings.aiProvider);
            const response = await provider.generateProblems({
              prompt,
              timeoutMs: settings.aiTimeoutMs,
              model: settings.aiModel,
              reasoningEffort: settings.aiReasoningEffort,
              aiPath: settings.aiPath,
              workspaceDir: this.resolveWorkspaceDir(document),
              schemaPath: this.deps.problemFinderSchemaPath,
              userInitiated: true
            });

            const issues = response.issues.slice(0, issueCountForRun);
            const resolution = resolveProblemIssueRanges({
              analyzedText,
              issues
            });
            const analyzedStartDocOffset = document.offsetAt(analyzedRange.start);
            const analyzedEndDocOffset = analyzedStartDocOffset + analyzedText.length;
            let outOfBoundsCount = 0;
            const trackedIssues: TrackedProblemIssue[] = [];

            for (const [index, resolvedIssue] of resolution.resolved.entries()) {
              const startDocOffset = analyzedStartDocOffset + resolvedIssue.span.start;
              const endDocOffset = analyzedStartDocOffset + resolvedIssue.span.end;
              if (
                startDocOffset < analyzedStartDocOffset ||
                endDocOffset > analyzedEndDocOffset ||
                endDocOffset <= startDocOffset
              ) {
                outOfBoundsCount += 1;
                continue;
              }

              const startPosition = document.positionAt(startDocOffset);
              const endPosition = document.positionAt(endDocOffset);
              trackedIssues.push({
                id: this.createProblemId(document.uri.toString(), resolvedIssue.issue, startDocOffset, endDocOffset, index),
                issue: resolvedIssue.issue,
                start: {
                  line: startPosition.line,
                  character: startPosition.character
                },
                end: {
                  line: endPosition.line,
                  character: endPosition.character
                },
                deleted: false,
                dirty: false
              });
            }

            return {
              trackedIssues,
              skippedFindings: resolution.unresolvedCount + outOfBoundsCount
            };
          }
        );

        let shouldApplyResult = true;
        if (document.version !== initialVersion) {
          const staleChoice = await vscode.window.showWarningMessage(
            "Saurus: The file changed while diagnosis was running. Results may be stale.",
            "Re-run",
            "Apply anyway"
          );

          if (staleChoice === "Re-run") {
            rerunRequested = true;
            shouldApplyResult = false;
          } else if (staleChoice !== "Apply anyway") {
            void vscode.window.showInformationMessage("Saurus: diagnosis discarded because the file changed.");
            shouldApplyResult = false;
          }
        }

        if (shouldApplyResult) {
          this.tracker.load(document.uri.toString(), result.trackedIssues);
          this.refreshDocumentDecorations(document);

          if (result.skippedFindings > 0) {
            void vscode.window.showInformationMessage(
              `Saurus: ${result.skippedFindings} finding(s) could not be anchored to exact text and were skipped.`
            );
          }

          const severitySummary = summarizeSeverities(result.trackedIssues.map((entry) => entry.issue));
          if (severitySummary.high > 0 || severitySummary.medium > 0) {
            void vscode.window.showWarningMessage(
              "Saurus: Some problems were found. Hover over highlighted text to review details and fix hints."
            );
          } else if (result.trackedIssues.length === 0) {
            void vscode.window.showInformationMessage("Saurus: No problems found!");
          } else {
            void vscode.window.showInformationMessage(
              "Saurus: No major problems found. Hover over highlighted text to review optional improvements."
            );
          }
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`Saurus Problem Finder: ${this.getErrorMessage(error)}`);
      }
    } finally {
      this.inFlight = false;
    }

    if (rerunRequested) {
      await this.findProblems(editor);
    }
  }

  private async confirmFullFileDiagnosis(
    document: vscode.TextDocument,
    autoIssueCount: number,
    maxIssueCount: number
  ): Promise<{ confirmed: boolean; issueCountOverride?: number }> {
    const fileLabel = document.isUntitled ? "this untitled file" : path.basename(document.fileName);
    const consentChoice = await vscode.window.showQuickPick(
      [
        {
          label: "Yes",
          description: "Analyze full active file",
          detail: "Send the full file contents to AI for diagnosis.",
          value: "yes"
        },
        {
          label: "No",
          description: "Cancel diagnosis",
          detail: "Do not send full file contents to AI.",
          value: "no"
        }
      ],
      {
        title: "Saurus: Send full file to AI?",
        placeHolder: `No text selected. Diagnose ${fileLabel}? This may consume more AI tokens/quota.`,
        ignoreFocusOut: true
      }
    );

    if (consentChoice?.value !== "yes") {
      return { confirmed: false };
    }

    const explicitCounts = Array.from(new Set<number>([2, 5, 8, 12, 20, maxIssueCount]))
      .filter((count) => count >= 1 && count <= maxIssueCount)
      .sort((left, right) => left - right);

    const countChoice = await vscode.window.showQuickPick(
      [
        {
          label: `Auto (${autoIssueCount})`,
          description: "Recommended",
          detail: "Derive issue count from input length.",
          value: "auto"
        },
        ...explicitCounts.map((count) => ({
          label: `${count}`,
          description: "Fixed",
          detail: `Always ask for ${count} issue${count === 1 ? "" : "s"}.`,
          value: String(count)
        }))
      ],
      {
        title: "Saurus: Number of issues to request",
        placeHolder: "Choose Auto or a fixed issue count for this diagnose run.",
        ignoreFocusOut: true
      }
    );

    if (!countChoice || countChoice.value === "auto") {
      return { confirmed: true };
    }

    const parsed = Number.parseInt(countChoice.value, 10);
    if (!Number.isFinite(parsed)) {
      return { confirmed: true };
    }

    return {
      confirmed: true,
      issueCountOverride: Math.max(1, Math.min(maxIssueCount, parsed))
    };
  }

  private createProblemId(
    uri: string,
    issue: ProblemIssue,
    startOffset: number,
    endOffset: number,
    index: number
  ): string {
    return hashText(`${uri}:${startOffset}:${endOffset}:${index}:${issue.question}:${issue.rationale}`);
  }

  private refreshDocumentDecorations(document: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === document.uri.toString()) {
        this.renderEditorDecorations(editor);
      }
    }
  }

  private clearDecorationsForDocument(document: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === document.uri.toString()) {
        editor.setDecorations(this.highSeverityDecoration, []);
        editor.setDecorations(this.mediumSeverityDecoration, []);
        editor.setDecorations(this.lowSeverityDecoration, []);
      }
    }
  }

  private clearAllDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.highSeverityDecoration, []);
      editor.setDecorations(this.mediumSeverityDecoration, []);
      editor.setDecorations(this.lowSeverityDecoration, []);
    }
  }

  private renderEditorDecorations(editor: vscode.TextEditor): void {
    const document = editor.document;
    const settings = this.deps.getSettings(document);
    if (!settings.enabled || !settings.languages.includes(document.languageId)) {
      editor.setDecorations(this.highSeverityDecoration, []);
      editor.setDecorations(this.mediumSeverityDecoration, []);
      editor.setDecorations(this.lowSeverityDecoration, []);
      return;
    }

    const uri = document.uri.toString();
    const tracked = this.tracker.getTracked(uri) ?? [];
    const activeEntries: HoverProblemEntry[] = [];

    for (const entry of tracked) {
      if (entry.deleted) {
        continue;
      }

      const clampedStart = this.clampPosition(document, entry.start);
      const clampedEnd = this.clampPosition(document, entry.end);
      if (clampedStart.isAfterOrEqual(clampedEnd)) {
        continue;
      }

      activeEntries.push({
        id: entry.id,
        issue: entry.issue,
        range: new vscode.Range(clampedStart, clampedEnd)
      });
    }

    if (activeEntries.length === 0) {
      editor.setDecorations(this.highSeverityDecoration, []);
      editor.setDecorations(this.mediumSeverityDecoration, []);
      editor.setDecorations(this.lowSeverityDecoration, []);
      return;
    }

    const highOptions: vscode.DecorationOptions[] = [];
    const mediumOptions: vscode.DecorationOptions[] = [];
    const lowOptions: vscode.DecorationOptions[] = [];
    const groupedEntries = buildOverlapGroups(activeEntries);
    const rangeState = new Map<string, { severity: ProblemIssue["severity"]; option: vscode.DecorationOptions }>();

    for (const group of groupedEntries) {
      const hoverMarkdown = this.buildHoverMarkdown(uri, group);
      for (const entry of group) {
        const key = `${entry.range.start.line}:${entry.range.start.character}-${entry.range.end.line}:${entry.range.end.character}`;
        const option: vscode.DecorationOptions = {
          range: entry.range,
          hoverMessage: hoverMarkdown
        };
        const existing = rangeState.get(key);
        if (!existing || severityRank(entry.issue.severity) > severityRank(existing.severity)) {
          rangeState.set(key, {
            severity: entry.issue.severity,
            option
          });
        }
      }
    }

    for (const state of rangeState.values()) {
      if (state.severity === "high") {
        highOptions.push(state.option);
      } else if (state.severity === "medium") {
        mediumOptions.push(state.option);
      } else {
        lowOptions.push(state.option);
      }
    }

    editor.setDecorations(this.highSeverityDecoration, highOptions);
    editor.setDecorations(this.mediumSeverityDecoration, mediumOptions);
    editor.setDecorations(this.lowSeverityDecoration, lowOptions);
  }

  private buildHoverMarkdown(uriString: string, entries: HoverProblemEntry[]): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = {
      enabledCommands: [IGNORE_PROBLEM_COMMAND]
    };

    if (entries.length > 1) {
      const highCount = entries.filter((entry) => entry.issue.severity === "high").length;
      const mediumCount = entries.filter((entry) => entry.issue.severity === "medium").length;
      const lowCount = entries.filter((entry) => entry.issue.severity === "low").length;
      markdown.appendMarkdown(`**${entries.length} issues in this section**`);
      markdown.appendMarkdown(`  \n${highCount} high, ${mediumCount} medium, ${lowCount} low`);
    }

    const sortedEntries = [...entries].sort((left, right) => {
      const severityDiff = severityRank(right.issue.severity) - severityRank(left.issue.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      return left.range.start.compareTo(right.range.start);
    });

    sortedEntries.forEach((entry, index) => {
      const confidence = `${Math.round(entry.issue.confidence * 100)}%`;
      const ignoreArgs = encodeURIComponent(JSON.stringify([uriString, entry.id]));
      const ignoreUri = vscode.Uri.parse(`command:${IGNORE_PROBLEM_COMMAND}?${ignoreArgs}`);

      markdown.appendMarkdown(`\n\n**${escapeMarkdown(entry.issue.question)}**  \n`);
      markdown.appendMarkdown(
        `${toSeverityLabel(entry.issue.severity)} severity · ${confidence} confidence · ${escapeMarkdown(entry.issue.category)}  \n`
      );
      markdown.appendMarkdown(`Why it matters: ${escapeMarkdown(entry.issue.rationale)}  \n`);
      markdown.appendMarkdown(`Fix hint: ${escapeMarkdown(entry.issue.fixHint)}  \n`);
      markdown.appendMarkdown(`[Dismiss](${ignoreUri.toString()})`);

      if (index < sortedEntries.length - 1) {
        markdown.appendMarkdown("\n\n---");
      }
    });

    return markdown;
  }

  private clampPosition(document: vscode.TextDocument, position: { line: number; character: number }): vscode.Position {
    const line = Math.max(0, Math.min(position.line, Math.max(0, document.lineCount - 1)));
    const maxCharacter = document.lineAt(line).text.length;
    const character = Math.max(0, Math.min(position.character, maxCharacter));
    return new vscode.Position(line, character);
  }

  private resolveWorkspaceDir(document: vscode.TextDocument): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }

    return path.dirname(document.fileName);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof AiCliMissingError) {
      return error.message;
    }

    if (error instanceof AiAuthError) {
      return error.message;
    }

    if (error instanceof AiRequestError) {
      return error.message;
    }

    if (
      error instanceof CopilotChatUnavailableError ||
      error instanceof CopilotChatConsentRequiredError ||
      error instanceof CopilotChatBlockedError ||
      error instanceof CopilotChatRequestError
    ) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Unexpected error while finding problems.";
  }
}

function toSeverityLabel(severity: ProblemIssue["severity"]): string {
  if (severity === "high") {
    return "High";
  }
  if (severity === "medium") {
    return "Medium";
  }
  return "Low";
}

function severityRank(severity: ProblemIssue["severity"]): number {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function summarizeSeverities(issues: ProblemIssue[]): { high: number; medium: number; low: number } {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const issue of issues) {
    if (issue.severity === "high") {
      high += 1;
      continue;
    }

    if (issue.severity === "medium") {
      medium += 1;
      continue;
    }

    low += 1;
  }

  return { high, medium, low };
}

function deriveIssueCountFromText(
  text: string,
  scope: "selection" | "file",
  maxIssueCount: number
): number {
  const words = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0;
  let suggested = 1;

  if (scope === "selection") {
    if (words <= 30) {
      suggested = 1;
    } else if (words <= 80) {
      suggested = 2;
    } else if (words <= 180) {
      suggested = 3;
    } else if (words <= 320) {
      suggested = 4;
    } else {
      suggested = 5;
    }
  } else {
    if (words <= 150) {
      suggested = 2;
    } else if (words <= 400) {
      suggested = 4;
    } else if (words <= 900) {
      suggested = 8;
    } else if (words <= 1800) {
      suggested = 12;
    } else {
      suggested = 20;
    }
  }

  return Math.max(1, Math.min(maxIssueCount, suggested));
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildOverlapGroups<T extends { range: vscode.Range }>(entries: T[]): T[][] {
  const groups: T[][] = [];
  const visited = new Set<number>();

  for (let index = 0; index < entries.length; index += 1) {
    if (visited.has(index)) {
      continue;
    }

    const group: T[] = [];
    const stack: number[] = [index];
    visited.add(index);

    while (stack.length > 0) {
      const currentIndex = stack.pop();
      if (currentIndex === undefined) {
        continue;
      }

      const current = entries[currentIndex];
      group.push(current);

      for (let nextIndex = 0; nextIndex < entries.length; nextIndex += 1) {
        if (visited.has(nextIndex)) {
          continue;
        }

        const next = entries[nextIndex];
        if (current.range.intersection(next.range)) {
          visited.add(nextIndex);
          stack.push(nextIndex);
        }
      }
    }

    group.sort((left, right) => left.range.start.compareTo(right.range.start));
    groups.push(group);
  }

  return groups;
}
