import * as fs from "fs/promises";
import * as path from "path";

const beginMarker = "<!-- kraken-atlas:start -->";
const endMarker = "<!-- kraken-atlas:end -->";
const defaultSkillVersion = "0.2.3";

export interface InstallAgentInstructionsResult {
  filePath: string;
  action: "created" | "updated";
}

export interface InstallAgentSkillResult {
  skillFolder: string;
  skillPath: string;
  referencesFolder: string;
  action: "created" | "updated";
}

export async function installAgentInstructions(workspaceRoot: string): Promise<InstallAgentInstructionsResult> {
  const filePath = path.join(workspaceRoot, "AGENTS.md");
  const block = renderAgentInstructions();
  const existing = await readOptional(filePath);
  const action: "created" | "updated" = existing === null ? "created" : "updated";
  const content = existing === null ? `${block}\n` : upsertBlock(existing, block);

  await fs.writeFile(filePath, content, "utf8");
  return { filePath, action };
}

export async function installAgentSkill(workspaceRoot: string, version = defaultSkillVersion): Promise<InstallAgentSkillResult> {
  const skillFolder = path.join(workspaceRoot, ".agents", "skills", "kraken-atlas");
  const referencesFolder = path.join(skillFolder, "references");
  const skillPath = path.join(skillFolder, "SKILL.md");
  const existing = await readOptional(skillPath);
  const action: "created" | "updated" = existing === null ? "created" : "updated";

  await fs.mkdir(referencesFolder, { recursive: true });
  await fs.writeFile(skillPath, renderAgentSkill(), "utf8");
  await fs.writeFile(path.join(skillFolder, ".kraken_atlas_version"), `${version}\n`, "utf8");
  await fs.writeFile(path.join(referencesFolder, "query-playbooks.md"), renderQueryPlaybooksReference(), "utf8");
  return { skillFolder, skillPath, referencesFolder, action };
}

export function renderAgentSkill(): string {
  return `---
name: kraken-atlas
description: "Query a local code relationship map before broad source reads. Prioritize C#/.NET symbols, semantic references, calls, type relationships, dependency injection, routes, configuration, and project boundaries."
trigger: /kraken-atlas
---

# Kraken Atlas

Kraken Atlas is a relationship map, not an implementation planner. Use direct graph evidence to decide which source slices need inspection.

## Core Loop

1. Run doctor before trusting the map.
2. Run project to inspect map scope and analyzer health.
3. Use symbol or search to find an exact anchor.
4. Use references and relationships to inspect semantic usage and neighboring edges.
5. Use flow only when a connected behavior must be traversed.
6. Open only source locations supported by returned evidence.

## Commands

    kraken-atlas doctor --workspace . --format agent
    kraken-atlas query project --workspace . --format agent
    kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query references "Namespace.Type.Method" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query relationships "Namespace.Type" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query relationships "Namespace.Type.Method" --workspace . --edge CALLS --limit 30 --format agent
    kraken-atlas query flow "route, service, or behavior" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query search "exact source term" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas context relationships "Namespace.Type" --workspace . --context ProjectOrFolderName --format md

If the CLI is not on PATH, use .\\.kraken-atlas\\bin\\kraken-atlas.cmd on Windows or ./.kraken-atlas/bin/kraken-atlas on macOS/Linux.

## Rules

- Treat confidence and source locations as part of every map fact.
- Empty references are a coverage signal, not proof of non-use.
- Prefer exact symbol IDs after discovery.
- Follow returned next queries one graph hop at a time.
- Fall back to focused source inspection when the map cannot prove a relationship.

Read references/query-playbooks.md for direct relationship recipes.
`;
}

export function renderQueryPlaybooksReference(): string {
  return `# Kraken Atlas Relationship Query Playbooks

Run kraken-atlas doctor --workspace . --format agent first.

## Find Callers And Callees

    kraken-atlas query references "Namespace.Type.Method" --workspace . --format agent
    kraken-atlas query relationships "Namespace.Type.Method" --workspace . --edge CALLS --format agent

## Follow Interface And Dependency Injection Edges

    kraken-atlas query relationships "IServiceName" --workspace . --format agent

Inspect IMPLEMENTS, INJECTS, and REGISTERS edges. Use exact returned symbol IDs for follow-up queries.

## Follow ASP.NET Core Entry Points

    kraken-atlas query search "/api/route" --workspace . --format agent
    kraken-atlas query relationships "route:csharp:..." --workspace . --format agent
    kraken-atlas query flow "controller or endpoint name" --workspace . --format agent

Inspect MAPS_ROUTE, CALLS, REQUIRES_AUTH, and service edges.

## Follow Data And Configuration

    kraken-atlas query relationships "DbContextOrEntity" --workspace . --format agent
    kraken-atlas query relationships "ConfigKeyOrOptionsType" --workspace . --format agent

Inspect USES_DBSET, DBSET_FOR, QUERIES, WRITES, USES_CONFIG_KEY, BINDS_OPTIONS, and USES_OPTIONS when present.

## Fallback Discovery

    kraken-atlas query symbol "KnownName" --workspace . --format agent
    kraken-atlas query search "exact error, route, or identifier" --workspace . --format agent

Narrow the query before opening broad directories.
`;
}

export function renderAgentInstructions(): string {
  return `${beginMarker}
# Kraken Atlas

Use Kraken Atlas before broad file reads. It provides a local, queryable relationship map with source locations and confidence.

## Agent Query Loop

1. Run kraken-atlas doctor --workspace . --format agent.
2. Run kraken-atlas query project --workspace . --format agent.
3. Find an anchor with symbol or search.
4. Inspect semantic usage with references and graph edges with relationships.
5. Use flow for a bounded connected traversal.
6. Open only the returned files and line ranges needed for the task.

## Direct Queries

    kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query references "Namespace.Type.Method" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query relationships "Namespace.Type" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query relationships "Namespace.Type.Method" --workspace . --edge CALLS --limit 30 --format agent
    kraken-atlas query flow "route, service, or behavior" --workspace . --context ProjectOrFolderName --format agent
    kraken-atlas query search "exact source term" --workspace . --context ProjectOrFolderName --format agent

When kraken-atlas is unavailable on PATH, use .\\.kraken-atlas\\bin\\kraken-atlas.cmd on Windows or ./.kraken-atlas/bin/kraken-atlas on macOS/Linux.

## VS Code Commands

- Kraken Atlas: Check Map Health
- Kraken Atlas: Show Project Summary
- Kraken Atlas: Find Symbol
- Kraken Atlas: Find References
- Kraken Atlas: Show Relationships
- Kraken Atlas: Trace Feature Flow
- Kraken Atlas: Search Map
- Kraken Atlas: Export Context Pack

## Rules

- Kraken Atlas maps relationships; it does not decide where code should be added.
- Treat empty references as an analyzer coverage signal, not proof that a symbol is unused.
- Prefer exact symbol IDs and edge filters for follow-up queries.
- Follow one graph hop at a time and stop when evidence answers the task.
- Verify dynamic, generated, reflection-based, and framework-dispatched behavior in source when static evidence is incomplete.

## Scope

.NET Core and C# semantic relationship accuracy are the highest priority. Razor, JavaScript, and React/TypeScript mapping remain secondary coverage areas.
${endMarker}`;
}

function upsertBlock(existing: string, block: string): string {
  const start = existing.indexOf(beginMarker);
  const end = existing.indexOf(endMarker);

  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(end + endMarker.length)}`.replace(/\s+$/u, "\n");
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${block}\n`;
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
