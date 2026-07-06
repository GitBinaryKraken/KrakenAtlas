import * as fs from "fs";
import * as path from "path";
import type { ProjectMetadata, RelationshipRecord } from "../model/records";
import type { QueryResponse } from "../query/queryService";

export function renderAgentReadme(project: ProjectMetadata): string {
  const languages = project.languages
    .map((language) => `${language.language}${language.primary ? " (primary)" : ""}: ${language.fileCount}`)
    .join(", ");
  const projectTypes = project.projectTypes.length ? project.projectTypes.join(", ") : "not detected";

  return `# Kraken Atlas Agent Guide

This repository has a generated .kraken-atlas index for AI-agent queries. Use it before opening broad source files.

## Project Snapshot

- Workspace: ${project.workspaceName}
- Primary language: ${project.primaryLanguage ?? "unknown"}
- Languages: ${languages || "none"}
- Project types: ${projectTypes}
- Records: ${project.recordCounts.files} files, ${project.recordCounts.symbols} symbols, ${project.recordCounts.relationships} relationships, ${project.recordCounts.patterns} patterns, ${project.recordCounts.findings ?? 0} findings

## Query Strategy

${project.agentGuidance.queryStrategy.map((item) => `- ${item}`).join("\n")}

## Useful VS Code Commands

- Kraken Atlas: Check Map Health
- Kraken Atlas: Show Project Summary
- Kraken Atlas: Find Symbol
- Kraken Atlas: Find References
- Kraken Atlas: Show Relationships
- Kraken Atlas: Show Detected Pattern
- Kraken Atlas: Trace Feature Flow
- Kraken Atlas: Suggest Where To Add Code
- Kraken Atlas: Search Map
- Kraken Atlas: Export Context Pack
- Kraken Atlas: Install CLI For Workspace Terminals

## Agent Rules

- Prefer \`.kraken-atlas/index.sqlite\` through Kraken Atlas query commands.
- Prefer relationship evidence and line ranges over full-file reads.
- Use \`nextQueries\` to walk the map one hop at a time.
- Generate \`.kraken-atlas/context-pack.md\` when a pasteable, bounded context bundle is needed.
`;
}

export interface ContextPackOptions {
  workspaceRoot?: string;
  excerptLineRadius?: number;
  maxExcerptCount?: number;
}

export function renderContextPack(response: QueryResponse, options: ContextPackOptions = {}): string {
  const lines = [
    "# Kraken Atlas Context Pack",
    "",
    `Query: ${response.query}`,
    `Answer: ${response.answer}`,
    `Confidence: ${response.confidence}`,
    `Context strategy: ${response.estimatedContextSavings}`,
    ""
  ];

  if (response.files.length) {
    lines.push("## Files", ...response.files.slice(0, 12).map((file) => `- ${file}`), "");
  }

  const sharedContracts = response.evidence.filter((item) => stringValue(item.recordType) === "sharedContractBoundary");
  if (sharedContracts.length) {
    lines.push("## Shared Contract Boundaries");
    for (const item of sharedContracts.slice(0, 4)) {
      lines.push(`- ${stringValue(item.name) || stringValue(item.nodeId)}: ${truncate(stringValue(item.message), 220)}`);
      const members = Array.isArray(item.members) ? item.members.map(stringValue).filter(Boolean).slice(0, 8) : [];
      if (members.length) {
        lines.push(`  - Members: ${members.join(", ")}`);
      }
    }
    lines.push("");
  }

  const sharedContractChecklists = response.evidence.filter((item) => stringValue(item.recordType) === "sharedContractChecklist");
  if (sharedContractChecklists.length) {
    lines.push("## Shared Contract Checklist");
    for (const checklist of sharedContractChecklists.slice(0, 3)) {
      lines.push(`- ${stringValue(checklist.name) || stringValue(checklist.nodeId)}: ${truncate(stringValue(checklist.message), 220)}`);
      const items = Array.isArray(checklist.items)
        ? checklist.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        : [];
      for (const item of items.slice(0, 8)) {
        const files = Array.isArray(item.files) ? item.files.map(stringValue).filter(Boolean).slice(0, 3) : [];
        lines.push(`  - ${stringValue(item.label)}: ${truncate(stringValue(item.message), 180)}${files.length ? ` Files: ${files.join(", ")}` : ""}`);
      }
    }
    lines.push("");
  }

  const contextPruning = response.evidence.filter((item) => stringValue(item.recordType) === "contextPruning");
  if (contextPruning.length) {
    lines.push("## Context Focus");
    for (const item of contextPruning.slice(0, 2)) {
      const tags = Array.isArray(item.tags) ? item.tags.map(stringValue).filter(Boolean).slice(0, 6) : [];
      const projects = Array.isArray(item.projects) ? item.projects.map(stringValue).filter(Boolean).slice(0, 6) : [];
      lines.push(`- ${truncate(stringValue(item.message), 220)}`);
      if (tags.length || projects.length) {
        lines.push(`  - Tags: ${tags.length ? tags.join(", ") : "none"}; projects: ${projects.length ? projects.join(", ") : "none"}`);
      }
    }
    lines.push("");
  }

  const fileRecommendations = response.evidence.filter((item) => stringValue(item.recordType) === "fileRecommendation");
  if (fileRecommendations.length) {
    lines.push("## File Recommendations");
    for (const item of fileRecommendations.slice(0, 8)) {
      const reasons = Array.isArray(item.reasons) ? item.reasons.map(stringValue).filter(Boolean).slice(0, 3) : [];
      const matchedTags = Array.isArray(item.matchedTags) ? item.matchedTags.map(stringValue).filter(Boolean).slice(0, 4) : [];
      const roles = uniqueStrings([
        ...(Array.isArray(item.nodeRoles) ? item.nodeRoles.map(stringValue).filter(Boolean) : []),
        ...(Array.isArray(item.symbolRoles) ? item.symbolRoles.map(stringValue).filter(Boolean) : [])
      ]).slice(0, 6);
      const projectHint = item.projectHint && typeof item.projectHint === "object" ? item.projectHint as Record<string, unknown> : {};
      const project = stringValue(projectHint.project);
      const memberHints = Array.isArray(item.memberHints)
        ? item.memberHints.filter((member): member is Record<string, unknown> => Boolean(member) && typeof member === "object").slice(0, 8)
        : [];
      lines.push(`- ${stringValue(item.file)}${typeof item.score === "number" ? ` (score ${formatScore(item.score)})` : ""}`);
      if (matchedTags.length) {
        lines.push(`  - Node tags: ${matchedTags.join(", ")}`);
      }
      if (project || roles.length) {
        lines.push(`  - Guidance: ${project ? `project ${project}` : "project unknown"}${roles.length ? `; roles ${roles.join(", ")}` : ""}`);
      }
      if (memberHints.length) {
        lines.push(`  - Members: ${memberHints.map(formatMemberHint).join(", ")}`);
      }
      for (const reason of reasons) {
        lines.push(`  - ${truncate(reason, 180)}`);
      }
    }
    lines.push("");
  }

  const sourceFlow = response.flow.length ? response.flow : response.relationships;
  const flowSelection = selectConcernFlow(response.query, sourceFlow);
  const flow = flowSelection.flow;
  const symbols = flowSelection.concern
    ? uniqueStrings(flow.flatMap((edge) => [stringValue(edge.from), stringValue(edge.to)]).filter((endpoint) => endpoint.startsWith("symbol:")))
    : response.symbols;
  if (symbols.length) {
    lines.push("## Symbols", ...symbols.slice(0, 16).map((symbol) => `- ${symbol}`), "");
  }
  if (flowSelection.concern && sourceFlow.length && !flow.length) {
    lines.push(
      "## Concern Coverage",
      `- No direct ${flowSelection.concern} relationship evidence was found. File recommendations are text or structural discovery, not a confirmed ${flowSelection.concern} path.`,
      "- Run a narrower relationship or search query for a known validator, rule, model, handler, or comparable implementation.",
      ""
    );
  }
  if (flow.length) {
    lines.push("## Relationship Evidence");
    for (const edge of flow.slice(0, 16)) {
      lines.push(formatRelationshipEdge(edge));
    }
    lines.push("");

    const excerpts = buildEvidenceExcerpts(flow, options);
    if (excerpts.length) {
      lines.push("## Evidence Excerpts", ...excerpts, "");
    }
  }

  if (response.patterns.length) {
    lines.push("## Patterns");
    for (const pattern of response.patterns.slice(0, 8)) {
      lines.push(`- ${stringValue(pattern.id)}: ${stringValue(pattern.agentGuidance)}`);
    }
    lines.push("");
  }

  const findings = response.evidence.filter((item) => stringValue(item.recordType) === "finding");
  if (findings.length) {
    lines.push("## Code-Health Findings");
    for (const finding of findings.slice(0, 12)) {
      const locations = Array.isArray(finding.locations) ? finding.locations as Array<Record<string, unknown>> : [];
      const locationText = locations.slice(0, 6).map((location) => `${stringValue(location.file)}${formatRange(location.range)}`).join(", ");
      lines.push(`- ${stringValue(finding.title)}${locationText ? `: ${locationText}` : ""}. ${stringValue(finding.summary)}`);
    }
    lines.push("", "Review caveat: findings are candidates. Verify dynamic/framework/external usage and intentional duplication before cleanup.", "");
  }

  if (response.evidence.length && !flow.length && !response.patterns.length && !findings.length) {
    lines.push("## Evidence");
    for (const item of response.evidence.slice(0, 12)) {
      lines.push(`- ${compactJson(item)}`);
    }
    lines.push("");
  }

  if (response.nextQueries.length) {
    lines.push("## Next Queries", ...response.nextQueries.slice(0, 8).map((query) => `- \`${query}\``), "");
  }

  lines.push(
    "## Guidance",
    "- Open only the listed files and line ranges needed for the immediate edit.",
    "- Run a follow-up query before expanding scope.",
    "- Stop expanding once the listed evidence answers the immediate coding task."
  );

  return `${lines.join("\n").trimEnd()}\n`;
}

function buildEvidenceExcerpts(flow: Array<Record<string, unknown>>, options: ContextPackOptions): string[] {
  if (!options.workspaceRoot) {
    return [];
  }

  const radius = options.excerptLineRadius ?? 4;
  const maxCount = options.maxExcerptCount ?? 6;
  const seen = new Set<string>();
  const excerpts: string[] = [];

  for (const edge of rankExcerptEdges(flow)) {
    if (excerpts.length >= maxCount) {
      break;
    }

    for (const targetFile of fileEndpointTargets(edge)) {
      if (excerpts.length >= maxCount) {
        break;
      }
      const targetKey = `${targetFile}:1`;
      if (seen.has(targetKey)) {
        continue;
      }
      seen.add(targetKey);
      const targetExcerpt = readExcerpt(options.workspaceRoot, targetFile, 1, radius);
      if (targetExcerpt) {
        excerpts.push(formatExcerpt(targetFile, targetExcerpt, `Reason: ${stringValue(edge.type)} target file`));
      }
    }

    if (excerpts.length >= maxCount) {
      break;
    }

    const file = stringValue(edge.file);
    const range = edge.range as RelationshipRecord["range"] | undefined;
    if (!file || !range || typeof range.startLine !== "number") {
      continue;
    }

    const key = `${file}:${range.startLine}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const excerpt = readExcerpt(options.workspaceRoot, file, range.startLine, radius);
    if (!excerpt) {
      continue;
    }

    excerpts.push(formatExcerpt(file, excerpt, `Reason: ${stringValue(edge.type)}${edge.evidence ? `, ${truncate(stringValue(edge.evidence), 120)}` : ""}`));
  }

  return excerpts;
}

function selectConcernFlow(query: string, flow: Array<Record<string, unknown>>): { concern?: string; flow: Array<Record<string, unknown>> } {
  const normalized = query.toLowerCase();
  const concerns: Array<{ name: string; terms: RegExp; types: Set<string> }> = [
    { name: "validation/auth", terms: /\b(validat|authoriz|permission|policy|auth)\w*/u, types: new Set(["VALIDATES", "USES_VALIDATOR", "REQUIRES_AUTH"]) },
    { name: "persistence", terms: /\b(persist|stor|database|db|save|load|quer|repository)\w*/u, types: new Set(["WRITES", "QUERIES", "CALLS_REPOSITORY", "USES_DBSET", "DBSET_FOR", "WRITES_FIELD", "MAPS_PROPERTY", "BINDS_MODEL_PROPERTY"]) },
    { name: "browser state", terms: /\b(query.?string|browser.?history|url.?state)\b/u, types: new Set(["READS_QUERY_STRING", "WRITES_QUERY_STRING", "WRITES_BROWSER_HISTORY"]) },
    { name: "configuration", terms: /\b(config|option|setting|inject|registration|di)\w*/u, types: new Set(["USES_CONFIG_KEY", "USES_OPTIONS", "BINDS_OPTIONS", "INJECTS", "REGISTERS"]) }
  ];
  const concern = concerns.find((candidate) => candidate.terms.test(normalized));
  if (!concern) {
    return { flow };
  }

  return {
    concern: concern.name,
    flow: flow.filter((edge) => concern.types.has(stringValue(edge.type)))
  };
}

function formatExcerpt(file: string, excerpt: { startLine: number; text: string }, reason: string): string {
  return [
    `### ${file}:${excerpt.startLine}`,
    "",
    reason,
    "",
    `\`\`\`${languageForFile(file)}`,
    excerpt.text,
    "```"
  ].join("\n");
}

function fileEndpointTargets(edge: Record<string, unknown>): string[] {
  return [stringValue(edge.from), stringValue(edge.to)]
    .filter((endpoint) => endpoint.startsWith("file:"))
    .map((endpoint) => endpoint.slice("file:".length));
}

function rankExcerptEdges(flow: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const weight: Record<string, number> = {
    EMITS_EVENT: 0,
    SUBSCRIBES_EVENT: 1,
    UPDATES_ELEMENT_STATE: 2,
    WRITES_FIELD: 0,
    SELECTS_ELEMENT: 1,
    INVOKES_VIEW_COMPONENT: 2,
    RENDERS_VIEW: 3,
    USES_CSHARP_SYMBOL: 4,
    POSTS_TO: 5,
    CALLS: 6,
    CALLS_REPOSITORY: 7,
    WRITES: 8,
    QUERIES: 9
  };
  return [...flow].sort((left, right) => (weight[stringValue(left.type)] ?? 99) - (weight[stringValue(right.type)] ?? 99));
}

function readExcerpt(workspaceRoot: string, file: string, startLine: number, radius: number): { startLine: number; text: string } | undefined {
  const absolutePath = path.resolve(workspaceRoot, file);
  const normalizedRoot = path.resolve(workspaceRoot);
  if (!absolutePath.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    return undefined;
  }

  try {
    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    const first = Math.max(1, startLine - radius);
    const last = Math.min(lines.length, startLine + radius);
    const width = String(last).length;
    const text = lines
      .slice(first - 1, last)
      .map((line, index) => `${String(first + index).padStart(width, " ")} | ${line}`)
      .join("\n");
    return { startLine: first, text };
  } catch {
    return undefined;
  }
}

function languageForFile(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".cs") {
    return "csharp";
  }
  if (extension === ".cshtml" || extension === ".razor") {
    return "cshtml";
  }
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return "javascript";
  }
  if (extension === ".jsx") {
    return "jsx";
  }
  if (extension === ".ts" || extension === ".tsx") {
    return "typescript";
  }
  if (extension === ".html" || extension === ".htm") {
    return "html";
  }
  return "";
}

function formatRelationshipEdge(edge: Record<string, unknown>): string {
  const location = edge.file ? `${edge.file}${formatRange(edge.range)}` : "unknown location";
  const evidence = stringValue(edge.evidence);
  const suffix = evidence ? ` Evidence: ${truncate(evidence, 160)}` : "";
  return `- ${stringValue(edge.type)}: ${stringValue(edge.from)} -> ${stringValue(edge.to)} (${location}).${suffix}`;
}

function formatMemberHint(member: Record<string, unknown>): string {
  const owner = stringValue(member.owner);
  const name = stringValue(member.name);
  const typeName = stringValue(member.typeName);
  const required = member.required === true ? " required" : "";
  const nullable = member.nullable === true ? " nullable" : "";
  const label = `${owner ? `${owner}.` : ""}${name}`;
  return `${label}${typeName ? `:${typeName}` : ""}${required}${nullable}`;
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function formatRange(range: unknown): string {
  if (!range || typeof range !== "object") {
    return "";
  }
  const startLine = (range as RelationshipRecord["range"])?.startLine;
  return typeof startLine === "number" ? `:${startLine}` : "";
}

function compactJson(value: Record<string, unknown>): string {
  return truncate(JSON.stringify(value), 220);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
