import { AtlasSummary, EntityDetail } from "./contracts";

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
