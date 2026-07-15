import {
  AtlasSummary,
  CodeUsageResult,
  EntityDetail,
  SymbolSearchResult,
  WorkspaceOrientation
} from "./contracts";

export function renderAtlasSummary(summary: AtlasSummary, extensionVersion: string): string {
  if (summary.atlasState === "not_created") {
    return [
      `Kraken Atlas ${extensionVersion}`,
      "Atlas: not_created",
      "",
      "Run Kraken Atlas: Build Atlas to discover workspace projects and files."
    ].join("\n");
  }

  const lines = [
    `Kraken Atlas ${extensionVersion}`,
    `Workspace: ${summary.workspaceName ?? "unknown"}`,
    `Generation: ${summary.generation ?? "unknown"}`,
    `Solutions: ${summary.counts.solutions}`,
    `Projects: ${summary.counts.projects}`,
    `Files: ${summary.counts.files}`,
    `Entities: ${summary.counts.entities}`,
    `Relations: ${summary.counts.relations}`,
    `Project dependencies: ${summary.counts.projectDependencies}`,
    "",
    "Projects"
  ];

  for (const project of summary.projects) {
    const target = project.targetFrameworks ? ` | ${project.targetFrameworks}` : "";
    lines.push(
      `- ${project.relativePath} | ${project.projectKind}${target} | dependencies ${project.dependencyCount}`
    );
  }

  return lines.join("\n");
}

export function renderEntityDetail(entity: EntityDetail): string {
  const lines = [
    `${entity.kind}: ${entity.qualifiedName}`,
    `ID: ${entity.id}`,
    `Stable key: ${entity.stableKey}`,
    `Language: ${entity.language}`,
    `Generation: ${entity.generation}`,
    `Relations: ${entity.incomingRelations} incoming, ${entity.outgoingRelations} outgoing`
  ];
  if (entity.signature) {
    lines.push(`Signature: ${entity.signature}`);
  }
  if (entity.locations.length > 0) {
    lines.push("", "Locations");
    for (const location of entity.locations) {
      const generated = location.isGenerated ? ", generated" : "";
      lines.push(`- ${location.relativePath}:${location.startLine}:${location.startColumn} (${location.locationKind}${generated})`);
    }
  }
  return lines.join("\n");
}

export function renderSymbolSearch(result: SymbolSearchResult): string {
  if (result.atlasState === "not_created") {
    return "Symbol search: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before searching symbols.";
  }

  const suffix = result.truncated ? "+" : "";
  const lines = [
    `Symbol search: ${result.query}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Matches: ${result.matches.length}${suffix}`
  ];
  for (const match of result.matches) {
    const project = match.projectRelativePath ? ` | ${match.projectRelativePath}` : "";
    const location = match.firstDefinition
      ? ` | ${match.firstDefinition.relativePath}:${match.firstDefinition.startLine}:${match.firstDefinition.startColumn}`
      : "";
    const generated = match.firstDefinition?.isGenerated ? " | generated" : "";
    lines.push(`- ${match.kind} | ${match.qualifiedName}${project}${location}${generated}`);
    lines.push(`  ${match.signature}`);
    lines.push(`  ${match.stableKey}`);
  }
  return lines.join("\n");
}

export function renderCodeUsages(result: CodeUsageResult): string {
  if (result.atlasState === "not_created") {
    return "C# usages: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before finding usages.";
  }
  if (result.atlasState === "target_not_found" || !result.target) {
    return `C# usages: target_not_found\nGeneration: ${result.generation ?? "unknown"}`;
  }

  const suffix = result.truncated ? "+" : "";
  const lines = [
    `C# usages: ${result.target.qualifiedName}`,
    `Stable key: ${result.target.stableKey}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Matches: ${result.usages.length}${suffix}`
  ];
  for (const usage of result.usages) {
    const dispatch = usage.dispatchKind ? ` | ${usage.dispatchKind}` : "";
    const project = usage.projectRelativePath ? ` | ${usage.projectRelativePath}` : "";
    const generated = usage.evidence.isGenerated ? " | generated" : "";
    lines.push(
      `- ${usage.relationKind}${dispatch} | ${usage.sourceQualifiedName}${project} `
      + `| ${usage.evidence.relativePath}:${usage.evidence.startLine}:${usage.evidence.startColumn}${generated}`
    );
    lines.push(`  ${usage.sourceStableKey}`);
  }
  return lines.join("\n");
}

export function renderWorkspaceOrientation(
  orientation: WorkspaceOrientation,
  extensionVersion: string
): string {
  if (orientation.atlasState === "not_created") {
    return [
      `Kraken Atlas ${extensionVersion}`,
      "Workspace orientation: not_created",
      "",
      "Run Kraken Atlas: Build Atlas to discover workspace orientation."
    ].join("\n");
  }
  if (orientation.atlasState === "requires_rebuild") {
    return [
      `Kraken Atlas ${extensionVersion}`,
      `Workspace: ${orientation.workspaceName ?? "unknown"}`,
      `Generation: ${orientation.generation ?? "unknown"}`,
      "Workspace orientation: requires_rebuild",
      "",
      "Run Kraken Atlas: Build Atlas to add workspace orientation to this Atlas."
    ].join("\n");
  }

  const lines = [
    `Kraken Atlas ${extensionVersion}`,
    `Workspace: ${orientation.workspaceName ?? "unknown"}`,
    `Generation: ${orientation.generation ?? "unknown"}`,
    `Coverage: ${orientation.coverage.status}`,
    `Pending sources: ${orientation.coverage.pendingSources.join(", ") || "none"}`,
    "",
    "Projects"
  ];
  for (const project of orientation.projects) {
    const facets = project.facets.map(facet => facet.facet).join(", ") || project.projectKind;
    lines.push(`- ${project.relativePath} | ${project.language} | ${facets}`);
    const dimensions = groupDimensions(project.buildDimensions);
    if (dimensions) {
      lines.push(`  ${dimensions}`);
    }
  }

  if (orientation.workspaceBuildDimensions.length > 0) {
    lines.push("", "Workspace Build Dimensions", groupDimensions(orientation.workspaceBuildDimensions));
  }

  lines.push("", "Commands");
  for (const command of orientation.commands) {
    lines.push(
      `- ${command.kind} | ${command.commandText} | ${command.evidence.relativePath}:${command.evidence.line}`
    );
  }

  lines.push("", "Repository Rules");
  for (const rule of orientation.repositoryRules) {
    lines.push(
      `- P${rule.precedence} | ${rule.scope} | ${rule.summary} | ${rule.evidence.relativePath}:${rule.evidence.line}`
    );
  }
  return lines.join("\n");
}

function groupDimensions(dimensions: Array<{ kind: string; value: string }>): string {
  const grouped = new Map<string, string[]>();
  for (const dimension of dimensions) {
    const values = grouped.get(dimension.kind) ?? [];
    values.push(dimension.value);
    grouped.set(dimension.kind, values);
  }
  return [...grouped.entries()]
    .map(([kind, values]) => `${kind}: ${values.join(", ")}`)
    .join(" | ");
}
