import { AtlasSummary, EntityDetail, WorkspaceOrientation } from "./contracts";

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
      lines.push(`- ${location.relativePath}:${location.startLine}:${location.startColumn} (${location.locationKind})`);
    }
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
