import type { QueryResponse } from "../query/queryService";
import type { DoctorResult } from "../doctor/mapDoctor";
import type { UpdateProjectResult } from "../rebuild/updateProject";

export function renderAgentResponse(response: QueryResponse): string {
  let evidence = selectEvidence(response);
  const isWhereToAdd = evidence.some((item) => item.recordType === "fileRecommendation");
  const fileLimit = isWhereToAdd ? 6 : 8;
  const evidenceLimit = isWhereToAdd ? 6 : 10;
  const nextCommandLimit = 5;
  const files = response.files.slice(0, fileLimit);
  if (isWhereToAdd) {
    const fileSet = new Set(files);
    evidence = evidence.filter((item) =>
      (item.recordType === "fileRecommendation" && fileSet.has(stringValue(item.file))) ||
      item.recordType === "caveat"
    );
  }
  const lines = [
    "Answer",
    `${compactAnswer(response.answer)} Confidence: ${formatScore(response.confidence)}.`,
    "",
    "Open These Files"
  ];

  if (files.length) {
    lines.push(...files.map((file) => `- ${file}`));
  } else {
    lines.push("- No source files identified. Run a narrower query or use a next command below.");
  }

  lines.push("", "Evidence");
  if (evidence.length) {
    lines.push(...evidence.slice(0, evidenceLimit).map(formatEvidence));
  } else {
    lines.push("- No evidence records returned.");
  }

  lines.push("", "Next Commands");
  if (response.nextQueries.length) {
    lines.push(...response.nextQueries.slice(0, nextCommandLimit).map((query) => `- ${query}`));
  } else {
    lines.push("- No follow-up query recommended.");
  }

  lines.push(
    "",
    "Stop Condition",
    "- Stop expanding once the listed files and evidence answer the immediate task. Open only the cited files and line ranges needed for the edit."
  );

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderAgentBuildResult(result: UpdateProjectResult): string {
  return `${[
    "Answer",
    `Kraken Atlas ${result.mode === "skipped" ? "update skipped" : `${result.mode} update complete`}. ${result.reason}`,
    "",
    "Open These Files",
    `- ${result.outputFolder}`,
    "",
    "Evidence",
    `- Files: ${result.fileCount}`,
    `- Symbols: ${result.symbolCount}`,
    `- References: ${result.referenceCount}`,
    `- Relationships: ${result.relationshipCount}`,
    `- Patterns: ${result.patternCount}`,
    ...(result.scanSummary ? [`- Excluded files/folders: ${result.scanSummary.excludedFiles}`] : []),
    `- Added files: ${result.addedFiles.length}`,
    `- Changed files: ${result.changedFiles.length}`,
    `- Deleted files: ${result.deletedFiles.length}`,
    ...result.analyzerRuns.filter((run) => run.status === "failed").map((run) => `- Analyzer failed: ${run.id}${run.diagnosticCategory ? ` [${run.diagnosticCategory}]` : ""}. ${run.message ?? "No diagnostic message."}`),
    "",
    "Next Commands",
    ...(result.analyzerRuns.some((run) => run.status === "failed")
      ? ["- kraken-atlas doctor --workspace . --format agent", "- kraken-atlas rebuild --workspace . --format agent"]
      : ["- kraken-atlas query project --workspace .", "- kraken-atlas query flow \"feature or behavior\" --workspace ."]),
    "",
    "Stop Condition",
    "- Stop here if the map is current. Query the map before opening broad source files."
  ].join("\n")}\n`;
}

export function renderAgentDoctor(result: DoctorResult): string {
  const changedCount = result.addedFiles.length + result.changedFiles.length + result.deletedFiles.length;
  return `${[
    "Answer",
    `Kraken Atlas status: ${result.status}. ${result.message}`,
    "",
    "Open These Files",
    `- ${result.outputFolder}`,
    "",
    "Evidence",
    `- Missing outputs: ${result.missingOutputs.length ? result.missingOutputs.join(", ") : "none"}`,
    `- Added files: ${result.addedFiles.length}`,
    `- Changed files: ${result.changedFiles.length}`,
    `- Deleted files: ${result.deletedFiles.length}`,
    `- Total changed files: ${changedCount}`,
    `- C# files present: ${result.hasCSharpFiles}`,
    `- Roslyn analyzer found: ${result.roslynAnalyzerFound}`,
    ...(result.scanSummary ? [`- Excluded files/folders: ${result.scanSummary.excludedFiles}`] : []),
    ...result.corpusWarnings.map((warning) => `- Corpus warning: ${truncate(warning, 220)}`),
    ...(result.failedAnalyzerRuns.length
      ? result.failedAnalyzerRuns.flatMap((run) => [
        `- Analyzer failed: ${run.id}${run.diagnosticCategory ? ` [${run.diagnosticCategory}]` : ""}. ${run.message ?? "Analyzer failed."}`,
        ...(run.diagnosticLabel ? [`- Analyzer category: ${run.diagnosticLabel}`] : []),
        ...(run.detail ? [`- Analyzer detail: ${truncate(run.detail, 220)}`] : [])
      ])
      : ["- Failed analyzers: none"]),
    "",
    "Next Commands",
    ...(doctorRemediationCommands(result).length ? doctorRemediationCommands(result).map((command) => `- ${command}`) : ["- kraken-atlas query project --workspace ."]),
    "",
    "Stop Condition",
    "- Stop here if status is ready. If status is stale, missing, or degraded, run the remediation command before relying on query results."
  ].join("\n")}\n`;
}

function doctorRemediationCommands(result: DoctorResult): string[] {
  return [
    ...result.failedAnalyzerRuns.flatMap((run) => run.remediation ?? []),
    ...result.remediationCommands
  ].filter((command, index, commands) => commands.indexOf(command) === index);
}

function selectEvidence(response: QueryResponse): Array<Record<string, unknown>> {
  if (response.evidence.some((item) => item.recordType === "fileRecommendation" || item.recordType === "caveat")) {
    return response.evidence;
  }
  if (response.flow.length) {
    return response.flow;
  }
  if (response.relationships.length) {
    return response.relationships;
  }
  if (response.patterns.length) {
    return response.patterns;
  }
  return response.evidence;
}

function formatEvidence(item: Record<string, unknown>): string {
  if (item.recordType === "fileRecommendation") {
    const reasons = Array.isArray(item.reasons) ? item.reasons.filter((reason): reason is string => typeof reason === "string") : [];
    const suffix = reasons.slice(0, 2).join(" ");
    return `- ${stringValue(item.file)}: ${truncate(suffix, 150)}`;
  }

  if (item.recordType === "caveat") {
    return `- Caveat: ${truncate(stringValue(item.message), 220)}`;
  }

  if (typeof item.type === "string" && (item.from || item.to)) {
    return `- ${item.type}: ${stringValue(item.from)} -> ${stringValue(item.to)}${formatLocation(item)}${formatSnippet(item.evidence)}`;
  }

  if (typeof item.id === "string" && typeof item.name === "string") {
    return `- ${item.id}: ${item.name}${formatLocation(item)}${formatSnippet(item.agentGuidance)}`;
  }

  if (typeof item.recordId === "string") {
    return `- ${item.recordType ?? "record"}: ${item.recordId}${item.path ? ` (${item.path})` : ""}`;
  }

  return `- ${truncate(JSON.stringify(item), 220)}`;
}

function compactAnswer(answer: string): string {
  return answer
    .replace(/^Likely edit locations for "(.+)" ranked by text matches, feature-flow edges, and detected project patterns\.$/u, "Likely edit locations for \"$1\".")
    .replace(/^Feature-flow slice for "(.+)" with \d+ connected edge\(s\)\.$/u, "Feature-flow slice for \"$1\".");
}

function formatLocation(item: Record<string, unknown>): string {
  const file = stringValue(item.file);
  if (!file) {
    return "";
  }

  const range = item.range;
  if (range && typeof range === "object" && typeof (range as { startLine?: unknown }).startLine === "number") {
    return ` (${file}:${(range as { startLine: number }).startLine})`;
  }

  return ` (${file})`;
}

function formatSnippet(value: unknown): string {
  const text = stringValue(value);
  return text ? ` Evidence: ${truncate(text, 140)}` : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatScore(value: unknown): string {
  return typeof value === "number" ? value.toFixed(1).replace(/\.0$/, "") : "0";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
