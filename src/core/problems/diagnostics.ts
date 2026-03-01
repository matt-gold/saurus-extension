import { ProblemIssue, ProblemSeverity } from "../../types";

/** Represents diagnostic severities independent of VS Code runtime enums. */
export type ProblemDiagnosticSeverityKind = "error" | "warning" | "information";

/** Maps problem severity to a normalized diagnostic severity kind. */
export function mapProblemSeverityToDiagnosticSeverity(severity: ProblemSeverity): ProblemDiagnosticSeverityKind {
  if (severity === "high") {
    return "error";
  }
  if (severity === "medium") {
    return "warning";
  }
  return "information";
}

/** Formats a diagnostic message for one problem issue. */
export function formatProblemDiagnosticMessage(issue: ProblemIssue): string {
  const confidencePercent = `${Math.round(issue.confidence * 100)}%`;
  return [
    issue.question,
    `Why it matters: ${issue.rationale}`,
    `Fix hint: ${issue.fixHint}`,
    `Category: ${issue.category} • Confidence: ${confidencePercent}`
  ].join("\n");
}
