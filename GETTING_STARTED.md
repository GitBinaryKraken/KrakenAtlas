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
code --install-extension ..\pack-artifacts\kraken-atlas-0.1.10.vsix --force
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
Kraken Atlas: Open Map Folder
```

`Check Map Health`, `Show Project Summary`, `Find Symbol`, `Find References`, `Show Relationships`, `Show Detected Pattern`, `Trace Feature Flow`, `Suggest Where To Add Code`, `Search Map`, and `Export Context Pack` write their results to the `Kraken Atlas` output channel. This is the easiest way to inspect what map data the extension is working with without installing a global CLI.

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
3. Use `Suggest Where To Add Code` for planned changes, or `Trace Feature Flow` for existing behavior.
4. Use `Show Relationships`, `Find References`, `Find Symbol`, or `Search Map` only to expand from the first answer.
5. Use `Export Context Pack` only after the target files are narrowed, or use `kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md` from the terminal.
6. Stop expanding once `Open These Files` and `Evidence` answer the immediate task.

Good starting commands after installing the workspace terminal CLI:

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
```

The package includes `AGENT_SKILL.md` as a compact skill-style guide for AI agents. It summarizes the query loop, token-saving rules, command playbooks, and stop conditions.

## VS Code Command Guide

| Command | Use it when | What it does |
| --- | --- | --- |
| `Rebuild Map From Workspace` | First run, or after project/solution changes. | Recreates `.kraken-atlas/` from scratch. |
| `Update Map For Changed Files` | A map exists and you changed source files. | Refreshes changed files, with full rebuild fallback for semantic C# changes. |
| `Check Map Health` | You want to know whether query results are trustworthy. | Reports ready/stale/missing/degraded status and analyzer diagnostics. |
| `Show Project Summary` | You want to see what was indexed. | Shows project metadata, language counts, analyzer runs, and follow-up actions. |
| `Find Symbol` | You know a class, method, interface, or file name. | Finds matching symbols and source locations. |
| `Find References` | You want to see where a known symbol or method appears. | Shows reference records and source locations. |
| `Show Relationships` | You want dependencies, callers, implementations, routes, config usage, or project references. | Shows graph edges for the entered symbol, file, type, or graph id. |
| `Show Detected Pattern` | You want examples of a convention. | Shows repeated patterns such as controller-service, options/config, validation/auth, middleware, or repository data flow. |
| `Trace Feature Flow` | You want context for a behavior like login or image storage. | Returns a compact path through related UI/backend/data files. |
| `Suggest Where To Add Code` | You are planning a change. | Ranks likely edit files with reasons, related patterns, and caveats. |
| `Search Map` | You have a broad text term. | Searches indexed file, symbol, relationship, and pattern text. |
| `Export Context Pack` | You want a bounded markdown context bundle. | Writes `.kraken-atlas/context-pack.md`. Terminal use can source the pack from `flow`, `where-to-add`, `search`, `relationships`, `symbol`, `references`, `pattern`, or `project`. |
| `Install Agent Instructions` | You want workspace guidance for AI coding agents. | Creates or updates `AGENTS.md` with query-first instructions. |
| `Install CLI For Workspace Terminals` | You want `kraken-atlas` to work in VS Code terminals for this workspace. | Creates `.kraken-atlas/bin` shims and updates `.vscode/settings.json`; open a new terminal afterward. |
| `Open Map Folder` | You want raw generated files. | Opens `.kraken-atlas/` in the OS file explorer. |

## CLI Package Testing

The VS Code extension does not modify your global shell `PATH`. Use `Kraken Atlas: Install CLI For Workspace Terminals` for workspace-local terminal access, or use the Command Palette commands above for normal extension testing. The commands below are only for local npm-package testing.

From a temporary test workspace:

```powershell
npm init -y
npm install ..\kraken-atlas\kraken-atlas-0.1.10.tgz
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
