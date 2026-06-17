# Kraken Atlas

Kraken Atlas maps a VS Code workspace into a local, queryable code atlas so AI coding agents can open fewer files, spend fewer tokens, and make better edits with evidence.

Instead of asking an agent to scan a whole repo, Kraken Atlas gives it focused answers: likely edit locations, related files, symbols, references, feature-flow paths, detected project patterns, and bounded context packs.

Kraken Atlas is built first for C#/.NET Core, ASP.NET Core, Razor/HTML, and vanilla JavaScript projects. It is intentionally not a visual graph browser or static report generator. The product goal is practical codebase manipulation by AI agents inside VS Code.

## Why It Helps

- Reduces token usage by narrowing a task to the smallest useful file set.
- Helps agents avoid broad, expensive repository reads.
- Explains why files are relevant using relationships, symbols, routes, service calls, config usage, and detected patterns.
- Keeps the map in the workspace under `.kraken-atlas/`.
- Works from the VS Code Command Palette first, with an optional workspace-local terminal CLI for agents.
- Supports multi-project workspaces with project context narrowing.

## Features

**Query The Codebase Before Reading It**

Kraken Atlas gives an AI agent a fast first pass over the workspace map, so it can ask where to look before loading source files into context. This helps keep conversations smaller and prevents the agent from burning tokens on unrelated folders.

**Find Likely Edit Locations**

`Suggest Where To Add Code` turns a plain-language change request into a ranked file shortlist. Each recommendation includes short evidence from text matches, relationships, feature-flow edges, routes, services, config usage, and detected patterns.

**Trace Feature Flow Across A .NET Workspace**

Kraken Atlas can follow common ASP.NET Core paths through Razor/HTML, vanilla JavaScript, controllers, page models, services, repositories, options/config, middleware, hosted services, and project references. That gives agents a working map of how behavior moves through the codebase.

**Ask Relationship Questions**

Agents and developers can query symbols, references, callers, implementations, route mappings, project references, configuration usage, DOM hooks, event handlers, forms, and fetch calls without opening broad areas of the repo.

**Export Bounded Context Packs**

When a task is narrowed, Kraken Atlas can write a compact markdown context pack for the agent. The point is not to summarize the whole project; it is to hand the agent only the files and evidence needed for the next edit.

**Use Compact Agent Output**

`--format agent` is intentionally short: files to open, reasons, next queries, and a stop condition. `--format info` is available when a human wants more detail.

**Stay Local To The Workspace**

The map is stored in `.kraken-atlas/`, and the optional CLI installer only affects new VS Code integrated terminals for the current workspace. Kraken Atlas does not require a global CLI install for normal extension use.

**Focus On Coding, Not Reports**

Kraken Atlas is not trying to be a visual graph explorer or static HTML report generator. It is focused on helping AI agents manipulate real codebases with less context and better evidence.

## What It Maps

Kraken Atlas indexes:

- Files, language guesses, project boundaries, and project metadata.
- C# symbols, references, method calls, constructors, interfaces, implementations, return types, and project references.
- ASP.NET Core routes, minimal API endpoints, DI registrations, options/config usage, middleware, hosted services, request handlers, validation/auth patterns, and repository/data-flow signals.
- Razor/HTML forms, DOM hooks, script/style references, selectors, vanilla JavaScript event handlers, and fetch calls.
- Detected patterns such as controller-service flow, constructor injection, service registration, options/config usage, HTML form handlers, and vanilla JS DOM bindings.

## First-Time Setup In VS Code

After installing the extension, open the workspace you want to map and use `Ctrl+Shift+P` to run Kraken Atlas commands.

1. Run `Kraken Atlas: Rebuild Map From Workspace`.
2. Run `Kraken Atlas: Check Map Health`.
3. Run `Kraken Atlas: Show Project Summary` to confirm what was indexed.
4. Run `Kraken Atlas: Suggest Where To Add Code` and enter a change request, such as `add initial profile setup steps after user registration`.
5. Optional: run `Kraken Atlas: Install Agent Instructions` to add query-first guidance to `AGENTS.md`.
6. Optional: run `Kraken Atlas: Install CLI For Workspace Terminals`, then close existing VS Code terminals and open a new one.

Command results appear in the `Kraken Atlas` output channel. Follow-up suggestions point back to Command Palette actions unless the workspace-local CLI has been installed.

`Install CLI For Workspace Terminals` does not modify the global machine `PATH`. It creates local shims in `.kraken-atlas/bin` and updates `.vscode/settings.json` so new VS Code integrated terminals can run `kraken-atlas`.

For a fuller walkthrough, see [GETTING_STARTED.md](./GETTING_STARTED.md).

## Use Cases

**Find Where To Add Code**

Run `Kraken Atlas: Suggest Where To Add Code` when you know the change but not the right files. Kraken Atlas returns a ranked shortlist, evidence, follow-up queries, and a stop condition so an agent does not keep expanding context after it has enough.

**Trace An Existing Feature**

Run `Kraken Atlas: Trace Feature Flow` for behavior like login, profile editing, image upload, email sending, or admin approval. The query follows indexed routes, handlers, services, repositories, UI files, and related patterns.

**Understand A File Or Symbol**

Run `Kraken Atlas: Show Relationships`, `Kraken Atlas: Find Symbol`, or `Kraken Atlas: Find References` when an agent already has a file, class, method, or symbol name and needs nearby context.

**Create A Small Context Pack**

Run `Kraken Atlas: Export Context Pack` after a query has narrowed the task. The generated `.kraken-atlas/context-pack.md` is meant to be a bounded handoff for an AI agent, not a repo-wide report.

**Check Map Quality**

Run `Kraken Atlas: Check Map Health` when results look stale, incomplete, or oddly broad. It reports missing maps, stale files, analyzer diagnostics, excluded-file counts, and suggested fixes.

## AI Agent Workflow

Kraken Atlas is designed around a query-first loop:

1. Check map health before reading source files.
2. Pick a project context for parent workspaces, such as `WebUI`, `Api`, or `AdminTools`.
3. Ask `where-to-add` or `flow` before opening folders.
4. Expand only with targeted relationship, symbol, reference, or search queries.
5. Export a context pack when the relevant files are narrowed.
6. Stop opening files once the answer and evidence cover the immediate task.

The compact agent output is meant to save tokens. It prioritizes:

- Files to open first.
- Short reasons for each file.
- A small set of next queries.
- A clear stop condition.

The extension also includes [AGENT_SKILL.md](./AGENT_SKILL.md), a short skill-style guide that agents can use to apply Kraken Atlas consistently.

When the workspace-local CLI is installed, agents can run terminal queries like:

```powershell
kraken-atlas query where-to-add "add initial profile setup steps after user registration" --workspace . --context WebUI --format agent
kraken-atlas query flow "profile setup after registration" --workspace . --context WebUI --format agent
kraken-atlas query relationships "Kelp2025_WebUI/Services/KelpUserManager.cs" --workspace . --context WebUI --format agent
kraken-atlas context where-to-add "add initial profile setup steps after user registration" --workspace . --context WebUI --format md
```

Use `--format agent` for compact output. Use `--format info` when a human wants richer detail.

## Command Palette Reference

Open `Ctrl+Shift+P` and run:

| Command | Use It When |
| --- | --- |
| `Kraken Atlas: Rebuild Map From Workspace` | Mapping a workspace for the first time or after broad C# project changes. |
| `Kraken Atlas: Update Map For Changed Files` | Refreshing a map after normal edits. |
| `Kraken Atlas: Check Map Health` | Checking missing, stale, degraded, or incomplete map data. |
| `Kraken Atlas: Show Project Summary` | Seeing indexed projects, language counts, analyzer runs, and guidance. |
| `Kraken Atlas: Find Symbol` | Looking for a class, method, interface, file, or symbol. |
| `Kraken Atlas: Find References` | Finding where a known symbol appears. |
| `Kraken Atlas: Show Relationships` | Exploring dependencies, callers, implementations, routes, config usage, or project references. |
| `Kraken Atlas: Show Detected Pattern` | Inspecting repeated conventions such as service registration or controller-service flow. |
| `Kraken Atlas: Trace Feature Flow` | Following a behavior through UI, route, service, repository, and related code. |
| `Kraken Atlas: Suggest Where To Add Code` | Getting likely edit locations for a requested change. |
| `Kraken Atlas: Search Map` | Searching indexed map text before opening files. |
| `Kraken Atlas: Export Context Pack` | Writing a bounded markdown context pack for an agent. |
| `Kraken Atlas: Install Agent Instructions` | Creating or updating workspace `AGENTS.md` guidance. |
| `Kraken Atlas: Install CLI For Workspace Terminals` | Enabling `kraken-atlas` in new VS Code integrated terminals for this workspace. |
| `Kraken Atlas: Open Map Folder` | Inspecting generated map files directly. |

## Configuration And Ignore Rules

Kraken Atlas excludes common generated and tool-output folders by default, including `.kraken-atlas`, `graphify-out`, `artifacts`, `Sandbox`, `Sandbox_old`, `node_modules`, `bin`, `obj`, `dist`, `build`, and `coverage`.

You can tune indexing with VS Code settings:

```json
{
  "krakenAtlas.updateOnSave": false,
  "krakenAtlas.excludeDirectories": ["LegacyScratch"],
  "krakenAtlas.excludeGlobs": ["docs/archive/**"],
  "krakenAtlas.excludeExtensions": [".bak"],
  "krakenAtlas.excludeFiles": ["tmp_dbinspect.cs"],
  "krakenAtlas.includeGlobs": ["Sandbox/keep-this-fixture.cs"],
  "krakenAtlas.ignoreFile": ".kraken-atlas-ignore"
}
```

Add a `.kraken-atlas-ignore` file for project-specific rules:

```gitignore
# folders
LegacyScratch/
docs/archive/**

# file types and specific files
*.bak
tmp_dbinspect.cs

# explicit include
!Sandbox/keep-this-fixture.cs
```

Rebuild or update output reports excluded counts. `Check Map Health` warns when one indexed folder dominates the corpus.

## Generated Files

Kraken Atlas writes map data under `.kraken-atlas/`, including:

- `manifest.json`
- `project.json`
- `files.jsonl`
- `symbols.jsonl`
- `references.jsonl`
- `relationships.jsonl`
- `patterns.jsonl`
- `conventions.md`
- `agent-readme.md`
- `index.sqlite`
- `context-pack.md`, generated on demand

These files are meant for local agent queries and inspection. They are usually workspace artifacts, not source code.

## Current Scope

Strongest support today:

- C# and .NET Core.
- ASP.NET Core MVC, minimal APIs, Razor Pages, services, options/config, hosted services, middleware, and common validation/auth conventions.
- Razor/HTML and vanilla JavaScript relationships.
- Terminal and Command Palette workflows for AI coding agents.

Deferred or future work:

- First-class React and Node.js support.
- MCP server workflow.
- Human-facing visual graph browsing.
- Static HTML report generation.

## Contributor And Local VSIX Testing

This section is for contributors building the extension from source. Normal extension users should start with the Command Palette setup above.

```powershell
npm install
npm test
npm run check:vsix
code --install-extension ..\pack-artifacts\kraken-atlas-0.1.10.vsix --force
```

Development commands without linking:

```bash
node dist/cli.js rebuild --workspace path/to/project
node dist/cli.js update --workspace path/to/project
node dist/cli.js doctor --workspace path/to/project --format agent
node dist/cli.js install-agent --workspace path/to/project
node dist/cli.js query where-to-add "add a profile setup step" --workspace path/to/project --format agent
node dist/cli.js query flow "save user" --workspace path/to/project --format agent
node dist/cli.js query relationships UserService --workspace path/to/project --format agent
node dist/cli.js context where-to-add "add a profile setup step" --workspace path/to/project --format md
```

## Known Limits

- C# semantic changes can trigger full rebuilds.
- Query quality is strongest for common ASP.NET Core, Razor/HTML, and vanilla JavaScript patterns.
- EF support covers common `DbContext` and `DbSet` reads and writes, but deeper provider-specific behavior and migrations are not fully modeled.
- Validation/auth, hosted-service, middleware, and request-handler coverage is convention-based; unusual framework wrappers may need future analyzer rules.
