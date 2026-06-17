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
- Records: ${project.recordCounts.files} files, ${project.recordCounts.symbols} symbols, ${project.recordCounts.relationships} relationships, ${project.recordCounts.patterns} patterns

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

export function renderContextPack(response: QueryResponse): string {
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

  const fileRecommendations = response.evidence.filter((item) => stringValue(item.recordType) === "fileRecommendation");
  if (fileRecommendations.length) {
    lines.push("## File Recommendations");
    for (const item of fileRecommendations.slice(0, 8)) {
      const reasons = Array.isArray(item.reasons) ? item.reasons.map(stringValue).filter(Boolean).slice(0, 3) : [];
      lines.push(`- ${stringValue(item.file)}${typeof item.score === "number" ? ` (score ${formatScore(item.score)})` : ""}`);
      for (const reason of reasons) {
        lines.push(`  - ${truncate(reason, 180)}`);
      }
    }
    lines.push("");
  }

  if (response.symbols.length) {
    lines.push("## Symbols", ...response.symbols.slice(0, 16).map((symbol) => `- ${symbol}`), "");
  }

  const flow = response.flow.length ? response.flow : response.relationships;
  if (flow.length) {
    lines.push("## Relationship Evidence");
    for (const edge of flow.slice(0, 16)) {
      lines.push(formatRelationshipEdge(edge));
    }
    lines.push("");
  }

  if (response.patterns.length) {
    lines.push("## Patterns");
    for (const pattern of response.patterns.slice(0, 8)) {
      lines.push(`- ${stringValue(pattern.id)}: ${stringValue(pattern.agentGuidance)}`);
    }
    lines.push("");
  }

  if (response.evidence.length && !flow.length && !response.patterns.length) {
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

function formatRelationshipEdge(edge: Record<string, unknown>): string {
  const location = edge.file ? `${edge.file}${formatRange(edge.range)}` : "unknown location";
  const evidence = stringValue(edge.evidence);
  const suffix = evidence ? ` Evidence: ${truncate(evidence, 160)}` : "";
  return `- ${stringValue(edge.type)}: ${stringValue(edge.from)} -> ${stringValue(edge.to)} (${location}).${suffix}`;
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
