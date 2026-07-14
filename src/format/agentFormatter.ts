import type { QueryResponse } from "../query/queryService";
import type { DoctorResult } from "../doctor/mapDoctor";
import type { UpdateProjectResult } from "../rebuild/updateProject";

export function renderAgentResponse(response: QueryResponse): string {
  const evidence = selectEvidence(response);
  const isJavaScriptInteractionFlow = response.flow.some((item) => ["EMITS_EVENT", "SUBSCRIBES_EVENT", "UPDATES_ELEMENT_STATE"].includes(stringValue(item.type)));
  const fileLimit = 8;
  const evidenceLimit = isJavaScriptInteractionFlow ? 11 : response.flow.length ? 9 : 6;
  const nextCommandLimit = 3;
  const responseFiles = response.flow.length ? visibleEvidenceFiles(evidence, evidenceLimit) : response.files;
  const files = responseFiles.slice(0, fileLimit);
  const lines = [
    "Answer",
    `${compactAnswer(response.answer)} Confidence: ${formatScore(response.confidence)}.`,
    "",
    "Open These Files"
  ];

  if (files.length) {
    lines.push(...files.map((file, index) => `${index + 1}. ${file}`));
  } else {
    lines.push("- None. Narrow the query or run a next command.");
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
    "- Stop when the files above answer the task; avoid broad reads."
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
  if (response.flow.length) {
    const summaries = response.evidence.filter((item) => ["flowCoverage", "caveat", "contextExpansion"].includes(stringValue(item.recordType)));
    const anchors = response.evidence.filter((item) => item.recordType === "strongAnchor");
    return [...summaries, ...response.flow, ...anchors];
  }
  if (response.evidence.some((item) => ["caveat", "flowCoverage", "relationshipFilter", "reference", "referenceSummary", "datatypeProjectUsage", "nodeRoleSummary", "nodeTagSummary", "nodeMemberSummary", "contextExpansion", "searchSummary", "exactFileSearch", "projectSummary"].includes(stringValue(item.recordType)))) {
    return response.evidence;
  }
  if (response.relationships.length) {
    return response.relationships;
  }
  return response.evidence;
}

function visibleEvidenceFiles(evidence: Array<Record<string, unknown>>, evidenceLimit: number): string[] {
  return uniqueStrings(evidence.slice(0, evidenceLimit).flatMap((item) => {
    const files = [stringValue(item.file)];
    for (const endpoint of [stringValue(item.from), stringValue(item.to)]) {
      if (endpoint.startsWith("file:")) {
        files.push(endpoint.slice("file:".length));
      }
    }
    return files.filter(Boolean);
  }));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function formatEvidence(item: Record<string, unknown>): string {
  if (item.recordType === "caveat") {
    return `- Caveat: ${truncate(stringValue(item.message), 160)}`;
  }

  if (item.recordType === "contextCandidate") {
    return `- Context: ${stringValue(item.context)} (${truncate(stringValue(item.message), 100)})`;
  }

  if (item.recordType === "flowCoverage") {
    const scores = item.scores && typeof item.scores === "object" ? item.scores as Record<string, unknown> : {};
    return `- Coverage: ${truncate(stringValue(item.message), 100)} Similarity ${formatDecimal(scores.textSimilarity)}, connectivity ${formatDecimal(scores.graphConnectivity)}, feature ${formatDecimal(scores.featureCoverage)}.`;
  }

  if (item.recordType === "relationshipFilter") {
    const edgeTypes = Array.isArray(item.edgeTypes) ? item.edgeTypes.filter((value): value is string => typeof value === "string") : [];
    return `- Filter: ${edgeTypes.join(", ") || truncate(stringValue(item.message), 120)}`;
  }

  if (item.recordType === "contextExpansion") {
    return `- Context expansion: ${truncate(stringValue(item.message), 170)}`;
  }

  if (item.recordType === "searchSummary") {
    return `- Sampling: ${truncate(stringValue(item.message), 150)}`;
  }

  if (item.recordType === "exactFileSearch") {
    return item.found
      ? `- Exact file: ${stringValue(item.file)}${item.language ? ` (${stringValue(item.language)})` : ""}`
      : `- Exact file check: ${stringValue(item.requestedPath)} is not indexed.`;
  }

  if (item.recordType === "projectSummary") {
    const counts = item.recordCounts && typeof item.recordCounts === "object" ? item.recordCounts as Record<string, unknown> : {};
    const languages = Array.isArray(item.languages)
      ? item.languages.map((language) => {
        const row = language as Record<string, unknown>;
        return `${stringValue(row.language)} ${row.fileCount ?? 0}`;
      }).join(", ")
      : "unknown";
    const projects = Array.isArray(item.projects) ? item.projects.filter((value): value is string => typeof value === "string") : [];
    return [
      `- Workspace: ${stringValue(item.workspaceName)}; schema ${stringValue(item.schemaVersion)}; generated ${stringValue(item.generatedAt)}.`,
      `- Records: ${counts.files ?? 0} files, ${counts.symbols ?? 0} symbols, ${counts.relationships ?? 0} relationships, ${counts.references ?? 0} references.`,
      `- Languages: ${languages}.`,
      `- Projects: ${projects.length ? projects.join(", ") : "no .csproj files indexed"}.`
    ].join("\n");
  }

  if (item.recordType === "referenceSummary") {
    return `- Breakdown: source ${formatCounts(item.sourceReferenceKinds)}; edges ${formatCounts(item.relationshipTypes)}; anchors ${item.resolvedAnchorCount ?? 0}. Evidence is sampled; exact single-ID follow-ups may differ.`;
  }

  if (item.recordType === "datatypeProjectUsage") {
    return `- Datatype projects: declared ${formatCounts(item.declaredIn)}; references ${formatCounts(item.referencedFrom)}; relationship evidence ${formatCounts(item.relationshipEvidenceFrom)}.`;
  }

  if (item.recordType === "nodeRoleSummary") {
    const roles = Array.isArray(item.roles) ? item.roles.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object") : [];
    const labels = roles.slice(0, 6).map((role) => `${stringValue(role.role)} ${formatDecimal(role.confidence)}`).filter((value) => value.trim());
    return `- Node roles: ${labels.length ? labels.join(", ") : "none"}.`;
  }

  if (item.recordType === "nodeTagSummary") {
    const tags = Array.isArray(item.tags) ? item.tags.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object") : [];
    const labels = tags.slice(0, 10).map((tag) => stringValue(tag.tag)).filter(Boolean);
    return `- Node tags: ${labels.length ? labels.join(", ") : "none"}.`;
  }

  if (item.recordType === "nodeMemberSummary") {
    const members = Array.isArray(item.members) ? item.members.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object") : [];
    const labels = members.slice(0, 12).map(formatMemberLabel).filter(Boolean);
    const count = typeof item.memberCount === "number" ? item.memberCount : labels.length;
    return `- Datatype members: ${count} member(s)${labels.length ? `; ${labels.join(", ")}` : ""}${count > labels.length ? ", ..." : ""}.`;
  }

  if (item.recordType === "reference" && !item.recordId) {
    return `- Reference: ${stringValue(item.symbolName)} -> ${compactId(stringValue(item.resolvedSymbolId))}${formatLocation(item)}${item.context ? ` [${item.context}]` : ""}`;
  }

  if (item.recordType === "strongAnchor") {
    const concepts = Array.isArray(item.matchedConcepts) ? item.matchedConcepts.filter((value): value is string => typeof value === "string") : [];
    return `- Strong${item.crossContext ? " cross-project" : ""} anchor: ${compactId(stringValue(item.id))}${formatLocation(item)}${concepts.length ? `; matches ${concepts.join(", ")}` : ""}`;
  }

  if (typeof item.type === "string" && (item.from || item.to)) {
    return `- ${item.type}: ${compactId(stringValue(item.from))} -> ${compactId(stringValue(item.to))}${formatLocation(item)}${formatEndpointLocations(item)}${formatSnippet(item.evidence)}`;
  }

  if (typeof item.id === "string" && typeof item.name === "string") {
    return `- ${compactId(item.id)}: ${item.name}${formatLocation(item)}${formatSnippet(item.agentGuidance)}`;
  }

  if (typeof item.recordId === "string") {
    const location = item.path ? ` (${item.path}${typeof item.line === "number" ? `:${item.line}` : ""})` : "";
    const title = stringValue(item.title) || compactId(item.recordId);
    const kind = stringValue(item.matchKind) || stringValue(item.recordType) || "record";
    return `- ${kind}: ${title}${location}${formatSnippet(item.snippet)}`;
  }

  return `- ${truncate(JSON.stringify(item), 220)}`;
}

function compactAnswer(answer: string): string {
  return answer.replace(/^Feature-flow slice for "(.+)" with \d+ connected edge\(s\)\.$/u, "Feature-flow slice for \"$1\".");
}

function compactId(value: string): string {
  const csharpSymbol = /^symbol:csharp:(.+)$/u.exec(value);
  if (csharpSymbol) {
    return truncate(compactCSharpSymbol(csharpSymbol[1]), 70);
  }

  const razorElement = /^symbol:razor:.+:(form|button|input|anchor|element):([^:]+)$/u.exec(value);
  if (razorElement) {
    return `${razorElement[1]}:${razorElement[2]}`;
  }

  const jsEvent = /^symbol:javascript:.+:event:([^:]+):([^:]+)$/u.exec(value);
  if (jsEvent) {
    return `js:${jsEvent[1]}:${jsEvent[2]}`;
  }

  const jsSelector = /^symbol:javascript:.+:selector:([^:]+)$/u.exec(value);
  if (jsSelector) {
    return `js:selector:${jsSelector[1]}`;
  }

  const reactSymbol = /^symbol:react:.+:(component|hook|store|context|function|route):([^:]+)$/u.exec(value);
  if (reactSymbol) {
    return `react:${reactSymbol[1]}:${reactSymbol[2]}`;
  }

  const reactProp = /^prop:react:(.+)$/u.exec(value);
  if (reactProp) {
    return `prop:${reactProp[1]}`;
  }

  const route = /^route:(?:web|csharp):(.+)$/u.exec(value);
  if (route) {
    return `route:${route[1]}`;
  }

  return truncate(value
    .replace(/^symbol:javascript:/u, "js:")
    .replace(/^symbol:react:/u, "react:")
    .replace(/^symbol:razor:/u, "razor:")
    .replace(/^symbol:dotnet-project:/u, "project:")
    .replace(/^file:/u, ""), 70);
}

function compactCSharpSymbol(value: string): string {
  const paren = value.indexOf("(");
  if (paren < 0) {
    return value;
  }

  const methodPrefix = value.slice(0, paren);
  const lastDot = methodPrefix.lastIndexOf(".");
  if (lastDot < 0) {
    return `${methodPrefix}(...)`;
  }

  const typeDot = methodPrefix.lastIndexOf(".", lastDot - 1);
  const owner = typeDot >= 0 ? methodPrefix.slice(typeDot + 1, lastDot) : methodPrefix.slice(0, lastDot);
  const method = methodPrefix.slice(lastDot + 1);
  return `${owner}.${method}(...)`;
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

function formatEndpointLocations(item: Record<string, unknown>): string {
  const from = formatEndpointLocation(item.fromLocation);
  const to = formatEndpointLocation(item.toLocation);
  if (!from && !to) {
    return "";
  }

  return ` [nodes: ${from || "?"} -> ${to || "?"}]`;
}

function formatEndpointLocation(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const location = value as { file?: unknown; range?: unknown };
  const file = stringValue(location.file);
  if (!file) {
    return "";
  }

  const range = location.range;
  if (range && typeof range === "object" && typeof (range as { startLine?: unknown }).startLine === "number") {
    return `${file}:${(range as { startLine: number }).startLine}`;
  }

  return file;
}

function formatSnippet(value: unknown): string {
  const text = stringValue(value);
  return text ? `; ${truncate(text, 80)}` : "";
}

function formatMemberLabel(member: Record<string, unknown>): string {
  const name = stringValue(member.name);
  if (!name) {
    return "";
  }

  const typeName = stringValue(member.typeName);
  const required = member.required === true ? " required" : "";
  const nullable = member.nullable === true ? " nullable" : "";
  return `${name}${typeName ? `:${typeName}` : ""}${required}${nullable}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatScore(value: unknown): string {
  return typeof value === "number" ? value.toFixed(1).replace(/\.0$/, "") : "0";
}

function formatDecimal(value: unknown): string {
  return typeof value === "number" ? value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "") : "0";
}

function formatCounts(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "none";
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.length ? entries.map(([key, count]) => `${key}=${count}`).join(", ") : "none";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
