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
description: "Use for questions about a C#/.NET Core, ASP.NET Core, Razor/HTML, vanilla JavaScript, or first-pass React/TypeScript codebase when .kraken-atlas/ exists or Kraken Atlas is installed. Query the local code map before broad file reads to find likely edit locations, relationships, feature flows, patterns, and compact context packs for AI coding agents."
trigger: /kraken-atlas
---

# /kraken-atlas

Use Kraken Atlas before broad source reads. The goal is to answer: "What is the smallest reliable source slice I need for this coding task?"

## Fast Path

If \`.kraken-atlas/index.sqlite\` exists and the user asks where to edit, how a feature works, what calls a symbol, or what patterns exist, query Kraken Atlas first.

If \`kraken-atlas\` is not on PATH, try the workspace shim before asking the user to reinstall:

\`\`\`powershell
.\\.kraken-atlas\\bin\\kraken-atlas.cmd --help
\`\`\`

On macOS/Linux:

\`\`\`bash
./.kraken-atlas/bin/kraken-atlas --help
\`\`\`

Only ask the user to run \`Kraken Atlas: Install AI Agent Setup\` when the shim is missing.

## Core Commands

\`\`\`powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "PropertyOrSymbolName" --workspace . --context ProjectOrFolderName --edge WRITES_FIELD --limit 20 --format agent
kraken-atlas query references "SymbolOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query orphans "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
\`\`\`

## Direct Map Query Loop

When you already know an anchor such as a property, class, method, route, selector, React component, hook, file, config key, or graph id, query the atlas directly before opening source:

1. \`project\` to choose the context.
2. \`search\` or \`symbol\` to find the anchor.
3. \`relationships\` to inspect graph edges around the anchor.
4. \`references\` to retrieve source usages plus connected implementation, registration, injection, and call edges.
5. \`context\` to package only the narrowed source slice.

If PATH is unavailable on Windows, replace \`kraken-atlas\` with \`.\\.kraken-atlas\\bin\\kraken-atlas.cmd\`.

## Agent Rules

- Run \`doctor --format agent\` before trusting results.
- Use \`--context\` in parent workspaces; partial names are okay when unambiguous.
- Prefer \`where-to-add\` for planned changes.
- Prefer \`flow\` for existing behavior.
- Prefer \`relationships\` for known files, symbols, routes, services, or graph ids.
- Prefer \`references\` first for a known interface, class, or method when you need implementations, DI registrations, injection sites, and callers together.
- Use \`search\` only when the more specific queries are weak.
- Treat \`orphans\` as conservative candidates and \`duplicates\` as exact normalized callable-body groups; never perform automatic cleanup from findings alone.
- Follow \`Next Commands\` one hop at a time.
- Open only the files and line ranges supported by \`Open These Files\` and \`Evidence\`.
- Stop expanding when the evidence is enough for the edit.

## More Playbooks

Read \`references/query-playbooks.md\` when choosing the best query for a specific coding task.
`;
}

export function renderQueryPlaybooksReference(): string {
  return `# Kraken Atlas Query Playbooks

Use these recipes after running \`doctor --workspace . --format agent\`.

## Add Or Change A Field

\`\`\`powershell
kraken-atlas query where-to-add "add field-name to feature-name" --workspace . --context ProjectOrFolderName --format agent
\`\`\`

Inspect the returned model/entity, form/view, handler/controller, service, data, and validation files.

## Add Validation Or Authorization

\`\`\`powershell
kraken-atlas query where-to-add "add validation for request-name" --workspace . --context ProjectOrFolderName --format agent
\`\`\`

Expand validator, request/model, controller/page handler, service, and auth relationships.

## Trace Existing Behavior

\`\`\`powershell
kraken-atlas query flow "button, route, feature, or bug symptom" --workspace . --context ProjectOrFolderName --format agent
\`\`\`

Use this before opening controllers, views, JavaScript, or services.

## React Component Or Route Work

\`\`\`powershell
kraken-atlas query pattern-map --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "ComponentOrHookName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "button, route, component, or API behavior" --workspace . --context ProjectOrFolderName --format agent
\`\`\`

Use this for first-pass React/TypeScript maps before opening \`.jsx\`, \`.tsx\`, or \`.ts\` files. Expand \`RENDERS_COMPONENT\`, \`USES_HOOK\`, \`USES_STORE\`, \`PASSES_PROP\`, \`PROVIDES_CONTEXT\`, \`CONSUMES_CONTEXT\`, \`HANDLES_EVENT\`, \`MAPS_ROUTE\`, and \`CALLS_API_ROUTE\` edges one hop at a time.

## Inspect A Known File Or Symbol

\`\`\`powershell
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query references "SymbolOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "PropertyOrSymbolName" --workspace . --context ProjectOrFolderName --edge WRITES_FIELD --limit 20 --format agent
\`\`\`

For interface-based services, start with the interface name through \`references\`. Follow the returned exact implementation or method with \`relationships\` only when another hop is needed.

Treat empty \`references\` output as a coverage signal, not proof that a symbol is unused. Follow the returned \`relationships\` or \`search\` fallback commands for Razor markup, model binding, generated code, string-based conventions, reflection, and dynamic framework usage.

## Review Code-Health Findings

\`\`\`powershell
kraken-atlas query orphans --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates --workspace . --context ProjectOrFolderName --format agent
\`\`\`

Verify reflection, dynamic/framework invocation, generated code, and external consumers before deleting orphan candidates. Compare all duplicate locations and confirm shared ownership before consolidation.

Use direct map queries for questions like where a property is written, displayed, model-bound, persisted, retrieved, or connected to a route, form, selector, handler, service, repository, or project.

## Fallback Search

\`\`\`powershell
kraken-atlas query search "exact error message or UI label" --workspace . --context ProjectOrFolderName --format agent
\`\`\`

If output says the search is weak, narrow the terms before opening more files.

## Handoff Context

\`\`\`powershell
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
\`\`\`

Create a context pack only after query results prove which files matter.
`;
}

export function renderAgentInstructions(): string {
  return `${beginMarker}
# Kraken Atlas

Use Kraken Atlas before broad file reads, recursive search, or opening many source files. The goal is to answer: "What is the smallest reliable slice of this codebase I need to inspect for the current task?"

The project map is local and queryable from VS Code through the Command Palette. Terminal-based AI agents need a callable CLI in the workspace terminal. The normal setup is to run Kraken Atlas: Install AI Agent Setup once, then close old terminals and open a new VS Code integrated terminal.

Some agent terminals do not inherit VS Code's integrated-terminal PATH settings. If \`kraken-atlas\` is not recognized after setup, call the workspace shim directly instead of asking the user to repeat setup:

\`\`\`powershell
.\\.kraken-atlas\\bin\\kraken-atlas.cmd --help
.\\.kraken-atlas\\bin\\kraken-atlas.cmd doctor --workspace . --format agent
\`\`\`

On macOS/Linux:

\`\`\`bash
./.kraken-atlas/bin/kraken-atlas --help
./.kraken-atlas/bin/kraken-atlas doctor --workspace . --format agent
\`\`\`

## Agent Query Loop

1. Check map health.
2. Pick the target project/folder context when the workspace has multiple projects.
3. Run \`where-to-add\` for change planning, or \`flow\` for behavior tracing.
4. When you already know an anchor such as a property, class, method, route, selector, React component, hook, file, config key, or graph id, query the map directly with \`symbol\`, \`search\`, \`relationships\`, or \`references\`.
5. Expand only with \`relationships\`, \`references\`, \`symbol\`, or \`search\` when the first answer is not enough.
6. Export a context pack only after query results prove which files matter.
7. Stop opening more files once the returned evidence answers the immediate task.

## VS Code Commands

- Kraken Atlas: Check Map Health
- Kraken Atlas: Show Project Summary
- Kraken Atlas: Trace Feature Flow
- Kraken Atlas: Suggest Where To Add Code
- Kraken Atlas: Show Relationships
- Kraken Atlas: Export Context Pack
- Kraken Atlas: Install AI Agent Setup
- Kraken Atlas: Install CLI For Workspace Terminals

## CLI Requirement For Agents

If \`kraken-atlas\` is not recognized and \`.kraken-atlas/bin/kraken-atlas.cmd\` or \`.kraken-atlas/bin/kraken-atlas\` exists, use that direct shim path. Only ask the user to run Kraken Atlas: Install AI Agent Setup from \`Ctrl+Shift+P\` when the shim files are missing. Do not require a global CLI install for normal extension use.

## Native VS Code Agent Tools

When the VS Code agent surface exposes extension-contributed language-model tools, use these read-only tools before shell commands:

- \`kraken_atlas_doctor\`: check whether the map is ready.
- \`kraken_atlas_query\`: run \`project\`, \`plan-change\`, \`where-to-add\`, \`flow\`, \`relationships\`, \`search\`, \`symbol\`, \`references\`, \`pattern\`, \`pattern-map\`, \`hotspots\`, \`drift\`, \`orphans\`, or \`duplicates\`.
- \`kraken_atlas_context_pack\`: create compact context from a narrowed query.

Use terminal commands when those tools are unavailable or when command output needs to be shown directly.

Verify:

\`\`\`bash
kraken-atlas --help
\`\`\`

Then agents can use:

\`\`\`bash
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "PropertyOrSymbolName" --workspace . --context ProjectOrFolderName --edge WRITES_FIELD --limit 20 --format agent
kraken-atlas query references "SymbolOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query orphans "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
\`\`\`

If the npm package is installed locally instead, use:

\`\`\`bash
node ./node_modules/kraken-atlas/dist/cli.js doctor --workspace . --format agent
node ./node_modules/kraken-atlas/dist/cli.js query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
node ./node_modules/kraken-atlas/dist/cli.js query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
node ./node_modules/kraken-atlas/dist/cli.js query relationships "NameOrSymbolId" --workspace . --context ProjectOrFolderName --format agent
node ./node_modules/kraken-atlas/dist/cli.js context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
\`\`\`

If the workspace shim exists but PATH injection is unavailable, use:

\`\`\`powershell
.\\.kraken-atlas\\bin\\kraken-atlas.cmd query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
.\\.kraken-atlas\\bin\\kraken-atlas.cmd query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
.\\.kraken-atlas\\bin\\kraken-atlas.cmd query relationships "NameOrSymbolId" --workspace . --context ProjectOrFolderName --format agent
\`\`\`

## Query-First Rules

- Start with \`.kraken-atlas/agent-readme.md\` when it exists.
- If available, read the packaged \`AGENT_SKILL.md\` once for the Kraken Atlas query workflow.
- Run \`doctor --format agent\` or the VS Code Kraken Atlas: Check Map Health command before trusting query results.
- Run Kraken Atlas: Update Map For Changed Files, or \`kraken-atlas update --workspace . --format agent\`, when health or query output reports a stale map.
- If terminal use is needed and \`kraken-atlas\` is missing, first try the direct workspace shim path. Ask the user to run Kraken Atlas: Install CLI For Workspace Terminals only when the shim files are missing.
- Prefer \`--format agent\` for terminal output intended for AI-agent consumption.
- Use \`--format info\` only when a richer human-readable answer is needed.
- Prefer \`where-to-add\`, \`flow\`, and \`relationships\` over reading full files.
- Prefer direct map queries when you have a concrete anchor: \`symbol\` for names, \`search\` for text, \`relationships\` for graph edges, and \`references\` for semantic usage.
- In parent workspaces with multiple projects, add \`--context ProjectOrFolderName\` so broad queries resolve inside the intended project first. Partial names are okay when they clearly match one indexed project, such as \`--context WebUI\` for \`ExampleWebUI\`.
- Use returned file paths and line ranges to open only the smallest useful source slices.
- Follow \`Next Commands\` one hop at a time before expanding scope.
- Treat empty \`references\` output as a coverage signal, not proof that a symbol is unused. Follow the returned relationship/search fallback commands for Razor markup, model binding, generated code, string conventions, reflection, or dynamic framework usage.
- Treat \`orphans\` as candidates only and verify dynamic/framework/external usage before deletion. Treat \`duplicates\` as exact normalized method-body groups and verify intent before consolidation.
- Use \`search\` for fallback discovery when \`where-to-add\` or \`flow\` does not find enough evidence.
- Use \`context\` only when a bounded pasteable context pack is needed after narrowing the target.

## Token-Saving Checks

- Count how many files you opened; fewer is better.
- Prefer one compact context pack over many full source files.
- Keep follow-up query count low by using the returned \`Next Commands\`.
- Do not expand beyond the listed files when the evidence is enough.
- If the top files do not include the likely edit location, run a narrower query before opening more files.

## Task Playbooks

- Add/change a field: \`where-to-add "add field-name to feature-name" --workspace . --context ProjectOrFolderName --format agent\`; inspect returned model/entity, form/view, handler/controller, service, data, and validation files.
- Add validation/auth: \`where-to-add "add validation for request-name" --workspace . --context ProjectOrFolderName --format agent\`; inspect validator, request/model, controller/page handler, service, and auth evidence.
- Add endpoint/handler: \`where-to-add "add endpoint for feature-name" --workspace . --context ProjectOrFolderName --format agent\`, then \`flow "nearest existing endpoint or route" --workspace . --context ProjectOrFolderName --format agent\`; follow the existing route/controller/page/service pattern.
- Add setting/option: \`where-to-add "add setting for feature-name" --workspace . --context ProjectOrFolderName --format agent\`; expand \`USES_OPTIONS\`, \`BINDS_OPTIONS\`, or \`USES_CONFIG_KEY\` relationships.
- Trace a bug: \`flow "bug symptom or behavior" --workspace . --context ProjectOrFolderName --format agent\`; if weak, run \`search "exact error message or UI label" --workspace . --context ProjectOrFolderName --format agent\`.
- Find where a UI action posts: \`flow "button or form action name" --workspace . --context ProjectOrFolderName --format agent\`; expand \`POSTS_TO\`, \`HANDLES_EVENT\`, \`CALLS\`, and \`MAPS_ROUTE\`.
- Find callers of a service method: \`relationships "ServiceOrMethodName" --workspace . --context ProjectOrFolderName --format agent\`; for interface-based services, query both interface and implementation names.
- Find where data is persisted: \`where-to-add "persist field-or-entity-name" --workspace . --context ProjectOrFolderName --format agent\`; inspect entity/model, DbContext/DbSet, repository, service, and related entry points.
- React component or route work: \`relationships "ComponentOrHookName" --workspace . --context ProjectOrFolderName --format agent\`, then expand \`RENDERS_COMPONENT\`, \`USES_HOOK\`, \`USES_STORE\`, \`PASSES_PROP\`, \`HANDLES_EVENT\`, \`MAPS_ROUTE\`, or \`CALLS_API_ROUTE\` edges when the first slice needs one more hop.
- Inspect a known map anchor: \`relationships "PropertyOrSymbolOrFile" --workspace . --context ProjectOrFolderName --format agent\`; add \`--edge WRITES_FIELD --limit 20\` or another edge type when you need a focused slice.
- Review orphan candidates: \`orphans --workspace . --context ProjectOrFolderName --format agent\`; follow with focused \`relationships\`, \`references\`, and source inspection before deletion.
- Review duplicate methods: \`duplicates --workspace . --context ProjectOrFolderName --format agent\`; compare every returned file/line location before extracting shared code.
- Create handoff context after narrowing: \`context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md\`.

## Scope

Kraken Atlas is focused on C#/.NET Core, ASP.NET Core, Razor/HTML, vanilla JavaScript, and first-pass React/TypeScript patterns. Visual graph browsing, static HTML reports, broad narrative reports, hosted code analysis, and MCP-first workflows are not v1 goals.
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
