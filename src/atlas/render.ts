import {
  AtlasEntitySearchResult,
  AtlasSummary,
  AssessmentQueryResult,
  ChangeSurfaceItem,
  ChangeSurfaceResult,
  CodeUsageResult,
  DecorateNodesResult,
  EntityDetail,
  GitChangeProjectionResult,
  PreparedChangeResult,
  RelationQueryResult,
  RouteQueryResult,
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

export function renderEntitySearch(result: AtlasEntitySearchResult): string {
  if (result.atlasState === "not_created") {
    return "Entity search: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before searching entities.";
  }

  const suffix = result.truncated ? "+" : "";
  const lines = [
    `Entity search: ${result.query}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Matches: ${result.matches.length}${suffix}`
  ];
  for (const match of result.matches) {
    const project = match.projectRelativePath ? ` | ${match.projectRelativePath}` : "";
    const location = match.firstLocation
      ? ` | ${match.firstLocation.relativePath}:${match.firstLocation.startLine}:${match.firstLocation.startColumn}`
      : "";
    lines.push(`- ${match.kind} | ${match.qualifiedName}${project}${location}`);
    if (match.signature) {
      lines.push(`  ${match.signature}`);
    }
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

export function renderRelations(result: RelationQueryResult): string {
  if (result.atlasState === "not_created") {
    return "Relations: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before querying relations.";
  }
  if (result.atlasState === "entity_not_found" || !result.focus) {
    return `Relations: entity_not_found\nGeneration: ${result.generation ?? "unknown"}`;
  }

  const suffix = result.truncated ? "+" : "";
  const lines = [
    `Relations (${result.direction}): ${result.focus.qualifiedName}`,
    `Stable key: ${result.focus.stableKey}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Matches: ${result.relations.length}${suffix}`
  ];
  for (const relation of result.relations) {
    const dispatch = relation.dispatchKind ? `/${relation.dispatchKind}` : "";
    const scope = relation.logicalScope ? ` | ${relation.logicalScope}` : "";
    lines.push(
      `- ${relation.domain}/${relation.kind}${dispatch} | ${relation.source.qualifiedName} -> ${relation.target.qualifiedName}${scope}`
    );
    lines.push(
      `  ${relation.evidence.relativePath}:${relation.evidence.startLine}:${relation.evidence.startColumn}`
    );
  }
  return lines.join("\n");
}

export function renderRoute(result: RouteQueryResult): string {
  if (result.atlasState === "not_created") {
    return "Route: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before tracing routes.";
  }
  if (result.atlasState === "entity_not_found" || !result.source || !result.target) {
    return `Route: entity_not_found\nGeneration: ${result.generation ?? "unknown"}`;
  }

  const lines = [
    `Route: ${result.source.qualifiedName} -> ${result.target.qualifiedName}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Found: ${result.found}`,
    `Steps: ${result.steps.length} | Visited entities: ${result.visitedEntities} | Max depth: ${result.maxDepth}`,
    `Graph truncated: ${result.graphTruncated}`
  ];
  if (result.waypoints.length > 0) {
    lines.push(`Via: ${result.waypoints.map(waypoint => waypoint.qualifiedName).join(" -> ")}`);
  }
  for (const step of result.steps) {
    const relation = step.relation;
    const dispatch = relation.dispatchKind ? `/${relation.dispatchKind}` : "";
    const scope = relation.logicalScope ? ` | ${relation.logicalScope}` : "";
    lines.push(
      `${step.ordinal}. ${relation.domain}/${relation.kind}${dispatch} | ${relation.source.qualifiedName} -> ${relation.target.qualifiedName}${scope}`
    );
    lines.push(`   ${relation.evidence.relativePath}:${relation.evidence.startLine}:${relation.evidence.startColumn}`);
  }
  return lines.join("\n");
}

export function renderChangeSurface(result: ChangeSurfaceResult): string {
  if (result.atlasState === "not_created") {
    return "Change surface: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before querying change surfaces.";
  }
  if (result.atlasState === "entity_not_found" || !result.seed) {
    return `Change surface: entity_not_found\nGeneration: ${result.generation ?? "unknown"}`;
  }

  const lines = [
    `Change surface: ${result.seed.qualifiedName}`,
    `Stable key: ${result.seed.stableKey}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Bounds: depth ${result.maxDepth}, entities ${result.maxEntities}`,
    `Truncated: ${result.truncated || result.graphTruncated}`
  ];
  appendSurfaceItems(lines, "Direct", result.direct);
  appendSurfaceItems(lines, "Transitive", result.transitive);
  appendSurfaceItems(lines, "Related Tests", result.relatedTests);

  if (result.affectedProjects.length > 0) {
    lines.push("", "Affected Projects");
    for (const project of result.affectedProjects) {
      const test = project.isTest ? " | test" : "";
      lines.push(`- ${project.relativePath} | ${project.projectKind}${test}`);
    }
  }
  if (result.verificationCommands.length > 0) {
    lines.push("", "Verification Commands");
    for (const command of result.verificationCommands) {
      lines.push(`- ${command.kind} | ${command.commandText}`);
    }
  }
  return lines.join("\n");
}

export function renderGitChanges(result: GitChangeProjectionResult): string {
  if (result.atlasState === "not_created") {
    return "Git projection: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before projecting changes.";
  }
  if (result.atlasState === "no_repository") {
    return "Git projection: no_repository\n\nNo Git repository contains an open workspace root.";
  }

  const range = result.mode === "range" ? ` | ${result.baseRef}...${result.targetRef}` : "";
  const lines = [
    `Git projection: ${result.mode}${range}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Truncated: ${result.truncated}`
  ];
  for (const repository of result.repositories) {
    lines.push(
      "",
      `Repository: ${repository.repositoryRoot}`,
      `Branch: ${repository.branch ?? "detached"} | HEAD ${repository.head.slice(0, 12)} | dirty ${repository.dirty}`,
      `Changed files: ${repository.changedFiles.length}${repository.changesTruncated ? "+" : ""}`
    );
    for (const file of repository.changedFiles) {
      const rename = file.oldPath ? ` <- ${file.oldPath}` : "";
      const project = file.project ? ` | ${file.project.relativePath}` : "";
      lines.push(`- ${file.status} | ${file.path}${rename}${project}`);
      for (const entity of file.entities) {
        lines.push(`  ${entity.kind} | ${entity.qualifiedName} | ${entity.stableKey}`);
      }
    }
  }
  if (result.impacts.length > 0) {
    lines.push("", "Projected Impact");
    for (const impact of result.impacts) {
      const project = impact.project ? ` | ${impact.project.relativePath}` : "";
      lines.push(
        `- depth ${impact.depth} | ${impact.pathDirection} | ${impact.relationDomain}/${impact.relationKind} | ${impact.entity.qualifiedName}${project}`
      );
      lines.push(`  from ${impact.changedEntityStableKey}`);
    }
  }
  appendSurfaceItems(lines, "Related Tests", result.relatedTests);
  if (result.assessmentsAtRisk.length > 0) {
    lines.push("", "Assessments At Risk");
    for (const risk of result.assessmentsAtRisk) {
      const dependencies = risk.dependencies
        .map(dependency => `${dependency.kind}:${dependency.stableKey}`)
        .join(", ");
      lines.push(
        `- ${risk.status} | ${risk.subject.qualifiedName} | ${dependencies}`,
        `  ${risk.statement}`,
        `  ${risk.claimId}`
      );
    }
  }
  if (result.verificationCommands.length > 0) {
    lines.push("", "Verification Commands");
    for (const command of result.verificationCommands) {
      lines.push(`- ${command.kind} | ${command.commandText}`);
    }
  }
  return lines.join("\n");
}

function appendSurfaceItems(lines: string[], heading: string, items: ChangeSurfaceItem[]): void {
  if (items.length === 0) {
    return;
  }
  lines.push("", heading);
  for (const item of items) {
    const relation = item.viaRelation;
    const project = item.project ? ` | ${item.project.relativePath}` : "";
    lines.push(
      `- depth ${item.depth} | ${item.pathDirection} | ${relation.domain}/${relation.kind} | ${item.entity.qualifiedName}${project}`
    );
    lines.push(`  ${relation.evidence.relativePath}:${relation.evidence.startLine}:${relation.evidence.startColumn}`);
  }
}

export function renderAssessments(result: AssessmentQueryResult): string {
  if (result.atlasState === "not_created") {
    return "Assessments: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before querying assessments.";
  }
  if (result.atlasState === "entity_not_found" || !result.focus) {
    return `Assessments: entity_not_found\nGeneration: ${result.generation ?? "unknown"}`;
  }
  const suffix = result.truncated ? "+" : "";
  const lines = [
    `Assessments: ${result.focus.qualifiedName}`,
    `Stable key: ${result.focus.stableKey}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Claims: ${result.assessments.length}${suffix}`
  ];
  for (const assessment of result.assessments) {
    lines.push(
      "",
      `- ${assessment.dimension}/${assessment.updateKind} | ${assessment.status} | ${assessment.freshness} | confidence ${assessment.confidence.toFixed(2)}`,
      `  ${assessment.statement}`,
      `  ${assessment.claimId} | ${assessment.agentName}${assessment.agentModel ? `/${assessment.agentModel}` : ""}`
    );
    for (const evidence of assessment.evidence) {
      lines.push(`  evidence: ${evidence.summary}`);
    }
    for (const reason of assessment.staleReasons) {
      lines.push(`  stale: ${reason}`);
    }
  }
  return lines.join("\n");
}

export function renderPreparedChange(result: PreparedChangeResult): string {
  if (result.atlasState === "not_created") {
    return "Prepared change: Atlas not_created\n\nRun Kraken Atlas: Build Atlas before preparing a change.";
  }
  if (result.atlasState === "entity_not_found" || !result.seed) {
    return `Prepared change: entity_not_found\nGeneration: ${result.generation ?? "unknown"}`;
  }
  const lines = [
    `Prepared change: ${result.task}`,
    `Seed: ${result.seed.qualifiedName}`,
    `Stable key: ${result.seed.stableKey}`,
    `Generation: ${result.generation ?? "unknown"}`,
    `Budget: ${result.estimatedTokens}/${result.tokenBudget} estimated tokens | truncated ${result.truncated}`,
    `Source slices: ${result.sourceSlicesIncluded} included | ${result.omittedSourceSlices} omitted`,
    "",
    "Ranked Context"
  ];
  for (const item of result.items) {
    const relation = item.relationKind ? ` | ${item.relationDomain}/${item.relationKind}` : "";
    const direction = item.pathDirection ? ` | ${item.pathDirection}` : "";
    const project = item.project ? ` | ${item.project.relativePath}` : "";
    lines.push(`- ${item.score} | ${item.relevance}${direction}${relation} | ${item.entity.qualifiedName}${project}`);
    if (item.evidence) {
      lines.push(`  ${item.evidence.relativePath}:${item.evidence.startLine}:${item.evidence.startColumn}`);
    }
  }
  if (result.assessments.length > 0) {
    lines.push("", "Reusable Assessments");
    for (const assessment of result.assessments) {
      lines.push(
        `- ${assessment.dimension}/${assessment.updateKind} | ${assessment.status} | confidence ${assessment.confidence.toFixed(2)}`,
        `  ${assessment.statement}`,
        `  ${assessment.claimId}`
      );
    }
  }
  if (result.verificationCommands.length > 0) {
    lines.push("", "Verification Commands");
    for (const command of result.verificationCommands) {
      lines.push(`- ${command.kind} | ${command.commandText}`);
    }
  }
  if (result.omittedItems > 0 || result.omittedAssessments > 0 || result.omittedSourceSlices > 0) {
    lines.push(
      "",
      `Omitted by budget: ${result.omittedItems} context items, ${result.omittedAssessments} assessments, ${result.omittedSourceSlices} source slices`
    );
  }
  return lines.join("\n");
}

export function renderDecorationResult(result: DecorateNodesResult): string {
  const lines = [
    `Node decorations: ${result.status}`,
    `Operation: ${result.operationId}`,
    `Generation: ${result.atlasGeneration}`,
    `Session: ${result.sessionId}`,
    `Updates: ${result.results.length}`
  ];
  for (const item of result.results) {
    lines.push(
      `- ${item.clientUpdateId} | ${item.updateKind} | ${item.status} | evidence ${item.evidenceCount} | dependencies ${item.dependencyCount}`,
      `  ${item.claimIds.join(", ")}`
    );
  }
  for (const diagnostic of result.diagnostics) {
    lines.push(`- ${diagnostic.code} | ${diagnostic.path} | ${diagnostic.message}`);
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
