# Getting Started

Kraken Atlas is currently optimized for AI-agent usage in VS Code. First testers should use the Command Palette actions to build, inspect, and query the local map without installing a global CLI.

## Prerequisites

- Node.js 20 or newer.
- .NET SDK 9 or newer.
- A C#/.NET Core, ASP.NET Core, Razor/HTML, or vanilla JavaScript project to map.

## Install From A Local Tarball

From this repository:

```powershell
npm install
npm test
npm run publish:analyzer
npm pack
```

## Install The VS Code Extension Locally

From this repository:

```powershell
npm install
npm run check:vsix
code --install-extension ..\pack-artifacts\kraken-atlas-0.1.26.vsix --force
code --list-extensions --show-versions | Select-String kraken-atlas
```

The VSIX includes the compiled extension, CLI, docs, published Roslyn analyzer runtime, and local SQLite runtime. After installing, open a target workspace in VS Code and run:

```text
Kraken Atlas: Rebuild Map From Workspace
Kraken Atlas: Update Map For Changed Files
Kraken Atlas: Check Map Health
Kraken Atlas: Show Project Summary
Kraken Atlas: Find Symbol
Kraken Atlas: Find References
Kraken Atlas: Show Relationships
Kraken Atlas: Show Detected Pattern
Kraken Atlas: Trace Feature Flow
Kraken Atlas: Suggest Where To Add Code
Kraken Atlas: Search Map
Kraken Atlas: Export Context Pack
Kraken Atlas: Install Agent Instructions
Kraken Atlas: Install CLI For Workspace Terminals
Kraken Atlas: Install AI Agent Setup
Kraken Atlas: Open Map Folder
```

`Check Map Health`, `Show Project Summary`, `Find Symbol`, `Find References`, `Show Relationships`, `Show Detected Pattern`, `Find Orphaned Code Candidates`, `Find Duplicate Code Blocks`, `Trace Feature Flow`, `Suggest Where To Add Code`, `Search Map`, and `Export Context Pack` write their results to the `Kraken Atlas` output channel. This is the easiest way to inspect what map data the extension is working with without installing a global CLI.

## Using Where To Add

`Kraken Atlas: Suggest Where To Add Code` answers the question: "I need to make this change; which files should I open first?"

In VS Code:

1. Open the target workspace.
2. Run `Kraken Atlas: Rebuild Map From Workspace` if this is the first run.
3. Run `Kraken Atlas: Check Map Health` if you are not sure the map is current.
4. Run `Kraken Atlas: Suggest Where To Add Code`.
5. Enter the change in plain language, for example `add initial profile setup steps after user registration`.
6. Enter a project/folder context when working in a parent workspace with multiple projects, or leave it blank for a single project.
7. Read the ranked recommendations in the `Kraken Atlas` output channel.

The most important section is `Open These Files`. Start there, then use the `Evidence` section to understand why each file was suggested. Follow `Next Commands` only when the first ranked files do not give enough context.

Terminal equivalent after running `Kraken Atlas: Install CLI For Workspace Terminals` and opening a new terminal:

```powershell
kraken-atlas query where-to-add "add initial profile setup steps after user registration" --workspace . --context WebApp --format agent
```

For a single-project workspace, omit `--context`:

```powershell
kraken-atlas query where-to-add "add validation to the profile form" --workspace . --format agent
```

## AI Agent Query Loop

Use this sequence when an AI agent is trying to reduce context before editing:

1. `Check Map Health`.
2. Pick a project/folder context for multi-project workspaces. Partial names such as `WebUI` can resolve to indexed projects such as `Kelp2025_WebUI`.
3. Use `Plan Code Change` for planned features, `Suggest Where To Add Code` for focused edit-location questions, or `Trace Feature Flow` for existing behavior.
4. Use `Show Relationships`, `Find References`, `Find Symbol`, or `Search Map` only to expand from the first answer.
5. Use `Export Context Pack` only after the target files are narrowed, or use `kraken-atlas context plan-change "requested change" --workspace . --context ProjectOrFolderName --format md` from the terminal.
6. Stop expanding once `Open These Files` and `Evidence` answer the immediate task.

If the agent already knows an anchor such as a property, class, method, route, selector, file, config key, or graph id, query the map directly instead of asking a broad recommendation question first.

Good starting commands after installing the workspace terminal CLI:

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query pattern-map --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query hotspots --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query plan-change "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "PropertyOrSymbolName" --workspace . --context ProjectOrFolderName --edge WRITES_FIELD --limit 20 --format agent
kraken-atlas query references "SymbolOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query orphans "optional method or file filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates "optional method or file filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query drift "optional feature or file filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context plan-change "requested change" --workspace . --context ProjectOrFolderName --format md
```

Direct map-query loop:

1. Run `project` to choose the right context.
2. Run `search` or `symbol` to find a concrete anchor.
3. Run `relationships` around that anchor, optionally with `--edge` and `--limit`.
4. Run `references` when semantic usage matters.
5. Export `context` only after the useful source slice is clear.

The package includes `AGENT_SKILL.md` as a compact skill-style guide for AI agents. It summarizes the query loop, token-saving rules, task playbooks, and stop conditions.

For alpha feedback, use `ALPHA_FEEDBACK.md` in this repository. The most helpful reports include the exact query, `--context` value, `doctor --format agent` output, the returned `Open These Files` / `Evidence` / `Next Commands`, and what you expected instead.

Terminal-based AI agents need the `kraken-atlas` command to be available in the VS Code integrated terminal. Run `Kraken Atlas: Install AI Agent Setup` from `Ctrl+Shift+P`. This installs `AGENTS.md`, `.agents/skills/kraken-atlas/SKILL.md`, `.agents/skills/kraken-atlas/references/query-playbooks.md`, and the workspace CLI shim. Close old terminals, then open a new terminal and verify:

```powershell
kraken-atlas --help
```

Some agent terminals do not inherit VS Code's integrated-terminal PATH settings. If a normal VS Code terminal works but the agent still cannot find `kraken-atlas`, use the direct workspace shim:

```powershell
.\.kraken-atlas\bin\kraken-atlas.cmd --help
.\.kraken-atlas\bin\kraken-atlas.cmd doctor --workspace . --format agent
.\.kraken-atlas\bin\kraken-atlas.cmd query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
```

Workspace shims are refreshed by the extension when VS Code activates and resolve the newest installed Kraken Atlas extension at runtime. If a shim still reports a missing CLI target after an extension upgrade, rerun `Kraken Atlas: Install CLI For Workspace Terminals`.

Ask the user to rerun setup only when the `.kraken-atlas/bin` shim files are missing.

Kraken Atlas also contributes native VS Code language-model tools for agent surfaces that support extension tools:

- `kraken_atlas_doctor`
- `kraken_atlas_query`
- `kraken_atlas_context_pack`

Those tools are read-only and return compact map answers. The terminal CLI remains the universal fallback path for agents.

Useful first playbooks:

- Add/change field: `kraken-atlas query where-to-add "add field-name to feature-name" --workspace . --context ProjectOrFolderName --format agent`
- Plan a feature implementation: `kraken-atlas query plan-change "requested change" --workspace . --context ProjectOrFolderName --format agent`
- Add validation/auth: `kraken-atlas query where-to-add "add validation for request-name" --workspace . --context ProjectOrFolderName --format agent`
- Add endpoint/handler: `kraken-atlas query where-to-add "add endpoint for feature-name" --workspace . --context ProjectOrFolderName --format agent`
- Add setting/option: `kraken-atlas query where-to-add "add setting for feature-name" --workspace . --context ProjectOrFolderName --format agent`
- Trace bug: `kraken-atlas query flow "bug symptom or behavior" --workspace . --context ProjectOrFolderName --format agent`
- Find UI post: `kraken-atlas query flow "button or form action name" --workspace . --context ProjectOrFolderName --format agent`
- Find callers: `kraken-atlas query relationships "ServiceOrMethodName" --workspace . --context ProjectOrFolderName --format agent`
- Find persistence: `kraken-atlas query where-to-add "persist field-or-entity-name" --workspace . --context ProjectOrFolderName --format agent`
- Review shared hotspots: `kraken-atlas query hotspots --workspace . --context ProjectOrFolderName --format agent`
- Review orphan candidates: `kraken-atlas query orphans --workspace . --context ProjectOrFolderName --format agent`
- Review exact duplicate methods: `kraken-atlas query duplicates --workspace . --context ProjectOrFolderName --format agent`
- Review pattern drift: `kraken-atlas query drift --workspace . --context ProjectOrFolderName --format agent`

## VS Code Command Guide

| Command | Use it when | What it does |
| --- | --- | --- |
| `Rebuild Map From Workspace` | First run, or after project/solution changes. | Recreates `.kraken-atlas/` from scratch. |
| `Update Map For Changed Files` | A map exists and you changed source files. | Refreshes changed files, with full rebuild fallback for semantic C# changes. |
| `Check Map Health` | You want to know whether query results are trustworthy. | Reports ready/stale/missing/degraded status and analyzer diagnostics. |
| `Show Project Summary` | You want to see what was indexed. | Shows project metadata, language counts, analyzer runs, and follow-up actions. |
| `Find Symbol` | You know a class, method, interface, or file name. | Finds matching symbols and source locations. |
| `Find References` | You want to see where a known symbol or method appears. | Shows semantic reference records. If none are found, shows coverage caveats and bounded map-search fallbacks. |
| `Show Relationships` | You want dependencies, callers, implementations, routes, config usage, or project references. | Shows graph edges for the entered symbol, file, type, or graph id. |
| `Show Detected Pattern` | You want examples of a convention. | Shows repeated patterns such as controller-service, options/config, validation/auth, middleware, or repository data flow. |
| `Show Pattern Map` | You want the repo's architecture patterns before planning a change. | Groups detected conventions by architecture area and points to follow-up pattern or relationship queries. |
| `Show Architecture Hotspots` | You want central shared files before cross-cutting edits. | Ranks files by relationship volume, relationship-type diversity, and shared endpoints with cautious edit guidance. |
| `Find Orphaned Code Candidates` | You want conservative unused-method leads. | Shows private/internal C# methods with no mapped incoming static evidence and warns you to verify dynamic use. |
| `Find Duplicate Code Blocks` | You want exact duplication leads. | Shows grouped exact normalized C# method bodies with file and line locations. |
| `Find Pattern Drift Candidates` | You want places that may violate local architecture conventions. | Shows cautious candidates such as controllers bypassing service delegation or services bypassing repository data-flow patterns. |
| `Trace Feature Flow` | You want context for a behavior like login or image storage. | Returns a compact path through related UI/backend/data files. |
| `Suggest Where To Add Code` | You are planning a change. | Ranks likely edit files with reasons, related patterns, and caveats. |
| `Plan Code Change` | You want a compact implementation plan before opening files. | Combines edit-file ranking, pattern fit, hotspot/drift risk checks, and a context-pack command. |
| `Search Map` | You have a broad text term. | Searches indexed file, symbol, relationship, and pattern text. |
| `Export Context Pack` | You want a bounded markdown context bundle. | Writes `.kraken-atlas/context-pack.md`. Terminal use can source the pack from `flow`, `where-to-add`, `plan-change`, `search`, `relationships`, `symbol`, `references`, `pattern`, `pattern-map`, `hotspots`, `drift`, or `project`. |
| `Install Agent Instructions` | You want workspace guidance for AI coding agents. | Creates or updates `AGENTS.md` with query-first instructions. |
| `Install CLI For Workspace Terminals` | You want `kraken-atlas` to work in VS Code terminals for this workspace. | Creates `.kraken-atlas/bin` shims and updates `.vscode/settings.json`; open a new terminal afterward. |
| `Install AI Agent Setup` | You want agent instructions and terminal CLI setup in one step. | Updates `AGENTS.md`, installs `.agents/skills/kraken-atlas`, creates workspace CLI shims, and updates terminal PATH settings. |
| `Open Map Folder` | You want raw generated files. | Opens `.kraken-atlas/` in the OS file explorer. |

`Find References` is strongest for semantic analyzer records. Empty results do not prove a symbol is unused because Razor markup, model binding, generated code, string-based conventions, reflection, and dynamic framework usage may not appear as semantic references. Follow the returned fallback search or relationship commands before deciding a symbol has no usage.

The same caution applies to `orphans`: it is a conservative candidate query, not an automatic deletion list. `duplicates` currently reports exact normalized callable bodies only; near-duplicate and arbitrary block similarity are planned later.

## CLI Package Testing

The VS Code extension does not modify your global shell `PATH`. Use `Kraken Atlas: Install CLI For Workspace Terminals` for workspace-local terminal access, or use the Command Palette commands above for normal extension testing. External agent terminals may not inherit the VS Code integrated-terminal PATH; in that case, call `.\.kraken-atlas\bin\kraken-atlas.cmd` directly from the workspace root. The commands below are only for local npm-package testing.

From a temporary test workspace:

```powershell
npm init -y
npm install ..\kraken-atlas\kraken-atlas-0.1.26.tgz
```

For a project copied into the temp workspace as `.\AdminTools`, run:

```powershell
.\node_modules\.bin\kraken-atlas.cmd doctor --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd rebuild --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd doctor --workspace .\AdminTools --format agent
```

You can also point `--workspace` at a parent folder that contains several related `.csproj` projects. Kraken Atlas records `.csproj` `ProjectReference` items as `PROJECT_REFERENCES` edges:

```powershell
.\node_modules\.bin\kraken-atlas.cmd rebuild --workspace . --format agent
.\node_modules\.bin\kraken-atlas.cmd query relationships PROJECT_REFERENCES --workspace . --format agent
.\node_modules\.bin\kraken-atlas.cmd query pattern "project references" --workspace . --format agent
```

In a parent workspace with several apps, use `--context` when the query should start inside one project or folder:

```powershell
.\node_modules\.bin\kraken-atlas.cmd query flow "location" --workspace . --context Kelp2025_WebUI --format agent
.\node_modules\.bin\kraken-atlas.cmd query where-to-add "add location field" --workspace . --context Kelp2025_WebUI --format agent
.\node_modules\.bin\kraken-atlas.cmd context "location" --workspace . --context Kelp2025_WebUI --format agent
```

`--context` scopes broad search and flow seeds to that project first, while still allowing the returned graph slice to include useful cross-project relationships such as `PROJECT_REFERENCES`.

## Ignore Noisy Folders

Kraken excludes common tool output and generated folders by default, including `.kraken-atlas`, `graphify-out`, `artifacts`, `Sandbox`, `Sandbox_old`, `node_modules`, `bin`, `obj`, `dist`, `build`, and `coverage`.

For project-specific rules, add `.kraken-atlas-ignore` to the workspace:

```gitignore
LegacyScratch/
docs/archive/**
*.bak
tmp_dbinspect.cs
!Sandbox/keep-this-fixture.cs
```

VS Code settings can also add ignored folders, globs, extensions, specific files, and explicit include globs. `Check Map Health` and `doctor --format agent` surface excluded counts and noisy-corpus warnings.

## Agent Workflow

Use this loop before opening broad source files:

```powershell
.\node_modules\.bin\kraken-atlas.cmd doctor --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query project --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query flow "badge" --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query where-to-add "add badge field" --workspace .\AdminTools --format agent
```

If `doctor` reports `missing`, `stale`, or `degraded`, run the remediation command it prints before relying on query results.

## Useful Queries

```powershell
.\node_modules\.bin\kraken-atlas.cmd query project --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query symbol UserService --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query references UserService --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query relationships UserService --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query relationships "symbol:csharp:AdminTools.Services.IBadgeManagementService.SaveLocationBadgeAsync(AdminTools.Models.LocationBadgeForm)" --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query pattern controller-service-flow --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query search "save button" --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd context "add badge field" --workspace .\AdminTools --format agent
.\node_modules\.bin\kraken-atlas.cmd query flow "badge" --workspace . --context AdminTools --format agent
```

`query flow` returns a compact feature slice. Low-value framework leaf calls such as `string.Trim()` are hidden from default flow output, but direct relationship queries can still retrieve them.

## Install Agent Instructions

To add query-first guidance to a target repository:

```powershell
.\node_modules\.bin\kraken-atlas.cmd install-agent --workspace .\AdminTools
```

This creates or updates a Kraken Atlas block in `AGENTS.md`.

## Expected Output Folder

After rebuild, the target project contains:

```text
.kraken-atlas/
  manifest.json
  project.json
  files.jsonl
  symbols.jsonl
  references.jsonl
  relationships.jsonl
  patterns.jsonl
  conventions.md
  agent-readme.md
  index.sqlite
```

## Known Limits

- The visual graph is intentionally out of scope.
- MCP is intentionally deferred until the terminal CLI contract is stable.
- C# semantic changes trigger full rebuilds.
- Analyzer coverage is strongest for controllers, Razor Pages, services, DI, routes, forms, vanilla JS DOM hooks, options/config, repository/data flow, validation/auth, hosted services, middleware, request handlers, and common EF `DbSet` usage.
- Deeper EF query chains, migrations, unusual validation/auth frameworks, custom middleware wrappers, and nonstandard mediator patterns still need more validation.
- `doctor` reports categorized analyzer failures for common SDK/runtime, restore/package, project/input, and analyzer-crash cases, but unfamiliar toolchain failures may still be classified as `unknown`.
