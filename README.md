# Kraken Atlas

**Give AI coding agents a map before they read your repo.**

Kraken Atlas turns a VS Code workspace into a local, queryable code atlas so developers and AI agents can find the right files faster, understand how features move through the codebase, and make edits with evidence instead of guesswork.

Instead of asking an agent to scan the whole repository, ask Kraken Atlas first:

- Where should this change go?
- What files are related to this feature?
- Which symbols, routes, services, forms, handlers, or config keys are connected?
- What is the smallest useful context pack for the next edit?

Kraken Atlas is currently an **alpha feedback build** focused first on **C#/.NET Core**, **ASP.NET Core**, **Razor/HTML**, and **vanilla JavaScript** projects. Its code atlas prioritizes fast command and CLI queries that help agents find the right files, understand relationships, and work with focused context before making changes.

## What's New In 0.1.26

- Query conservative orphaned C# method candidates with file and line evidence.
- Find exact normalized duplicate C# method bodies across files and projects.
- Inspect findings through the CLI, Command Palette, or VS Code agent tools.
- Keep cleanup decisions safe with explicit dynamic/framework/external-use caveats.
- Preserve project context while labeling directly matching duplicate instances in connected projects.

Version `0.1.26` is a public alpha intended for real-project feedback. It has 59 automated tests and has been validated against a large multi-project ASP.NET Core/Razor workspace.

---

## Why Developers Use It

AI coding agents are powerful, but they waste time and tokens when they have to discover a codebase by opening folder after folder. Kraken Atlas gives them a local map first, so they can start with likely edit locations and expand only when the evidence says they should.

Use Kraken Atlas when you want to:

- Reduce unnecessary repository reads.
- Give agents a focused file shortlist before they edit.
- Trace feature flow through routes, views, handlers, services, repositories, and config.
- Ask relationship questions without manually searching the whole workspace.
- Find likely orphaned C# methods and exact duplicate callable bodies with source locations.
- Export a bounded context pack for a coding task.
- Keep project intelligence local to your workspace under `.kraken-atlas/`.

---

## What This Does, Plain English

Think of Kraken Atlas as a workspace map for AI-assisted development.

It scans your project, builds local index files, and lets you query the codebase before loading source files into an AI conversation. The result is a tighter workflow:

1. Build or update the map.
2. Ask where a change belongs.
3. Review the ranked files and evidence.
4. Open only the files that matter.
5. Export a small context pack when the task is narrowed.

Kraken Atlas does not try to summarize the entire project. It helps answer the next practical question: **what should I open, and why?**

---

## Key Features

### Query Before Reading

Ask Kraken Atlas about the workspace before opening large folders or pasting broad context into an AI chat. This helps agents spend their context window on relevant code instead of discovery.

### Suggest Where To Add Code

Turn a plain-language change request into a ranked list of likely edit locations.

Example:

```text
add initial profile setup steps after user registration
```

Kraken Atlas returns likely files, short reasons, related relationships, follow-up queries, and a stop condition so the agent knows when it has enough context.

### Trace Feature Flow

Follow behavior through common ASP.NET Core paths such as:

- Razor Pages
- MVC controllers
- Minimal API endpoints
- Page models
- Services
- Repositories
- Options/config usage
- Middleware
- Hosted services
- Vanilla JavaScript forms, events, selectors, and fetch calls

### Show Pattern Map

Ask for the detected architecture pattern map before planning a change:

```powershell
kraken-atlas query pattern-map --workspace . --context WebUI --format agent
```

Kraken Atlas groups observed conventions by architecture area, such as feature flow, data access, request safety, configuration, UI flow, and dependency management. Use this before `where-to-add` when you want to know which local pattern an agent should copy.

### Inspect Code-Health Candidates

Query likely unreferenced C# methods and exact normalized duplicate method bodies without generating a broad report:

```powershell
kraken-atlas query orphans --workspace . --context WebUI --format agent
kraken-atlas query duplicates --workspace . --context WebUI --format agent
```

Orphan results are candidates, not proof of dead code. Verify reflection, dynamic/framework invocation, generated code, and external consumers before deleting anything. Duplicate groups are exact normalized callable bodies; confirm that repetition is not intentional before consolidating ownership.

### Ask Relationship Questions

Query symbols, references, callers, implementations, route mappings, project references, configuration usage, DOM hooks, event handlers, forms, and fetch calls without manually searching broad areas of the repo.

### Export Bounded Context Packs

Generate a compact markdown handoff for an AI agent after the task has been narrowed. Context packs are meant for the next edit, not for whole-repo documentation.

### Agent-Friendly Output

Use `--format agent` for compact output that focuses on:

- Files to open first.
- Why each file matters.
- Next queries to run.
- When to stop expanding context.

Use `--format info` when a human wants more detail.

### Local Workspace Storage

Kraken Atlas stores map data under `.kraken-atlas/`. Normal extension use does not require a global CLI install. The optional CLI shim is workspace-local and affects only new VS Code integrated terminals for that workspace.

---

## Quick Start

1. Install Kraken Atlas in VS Code.
2. Open the workspace you want to map.
3. Press `Ctrl+Shift+P`.
4. Run `Kraken Atlas: Rebuild Map From Workspace`.
5. Run `Kraken Atlas: Check Map Health`.
6. Run `Kraken Atlas: Show Project Summary`.
7. Run `Kraken Atlas: Suggest Where To Add Code` and enter a task such as `add initial profile setup steps after user registration`.
8. Optional: run `Kraken Atlas: Find Orphaned Code Candidates` or `Kraken Atlas: Find Duplicate Code Blocks`.
9. For AI agents, run `Kraken Atlas: Install AI Agent Setup`.

```text
add initial profile setup steps after user registration
```

Command results appear in the **Kraken Atlas** output channel.

For a fuller walkthrough, see [GETTING_STARTED.md](./GETTING_STARTED.md). For the current product direction and pattern-mapping roadmap, see [NEXT_STEPS.md](./NEXT_STEPS.md).

---

## Recommended AI Agent Setup

Kraken Atlas works best when agents follow a query-first loop. The recommended setup is one Command Palette action:

```text
Kraken Atlas: Install AI Agent Setup
```

That command installs query-first `AGENTS.md` guidance and a workspace-local `kraken-atlas` CLI shim for new VS Code integrated terminals.
It also installs a project-local agent skill at `.agents/skills/kraken-atlas/SKILL.md` for agent surfaces that scan `.agents/skills`.

Manual setup alternatives:

| Command | What It Does |
| --- | --- |
| `Kraken Atlas: Install Agent Instructions` | Adds query-first guidance to `AGENTS.md`. |
| `Kraken Atlas: Install CLI For Workspace Terminals` | Adds a workspace-local `kraken-atlas` command for new VS Code integrated terminals. |

After installing the CLI shim, close existing VS Code terminals and open a new integrated terminal.

Verify:

```powershell
kraken-atlas --help
```

Some AI-agent terminals do not inherit VS Code's integrated-terminal PATH settings. If a normal VS Code terminal can run `kraken-atlas` but an agent terminal cannot, use the workspace shim directly:

```powershell
.\.kraken-atlas\bin\kraken-atlas.cmd --help
.\.kraken-atlas\bin\kraken-atlas.cmd doctor --workspace . --format agent
.\.kraken-atlas\bin\kraken-atlas.cmd query where-to-add "requested change" --workspace . --context WebUI --format agent
```

Workspace shims are refreshed by the extension when VS Code activates and resolve the newest installed Kraken Atlas extension at runtime. If a shim still reports a missing CLI target after an extension upgrade, rerun `Kraken Atlas: Install CLI For Workspace Terminals`.

The CLI installer does **not** modify the global machine `PATH`. It creates local shims in `.kraken-atlas/bin` and updates `.vscode/settings.json` for the current workspace.

---

## Agent Workflow

A good Kraken Atlas workflow looks like this:

1. Check map health before reading source files.
2. Pick a project context in parent workspaces, such as `WebUI`, `Api`, or `AdminTools`.
3. Ask `where-to-add` or `flow` before opening folders.
4. Expand only with targeted relationship, symbol, reference, or search queries.
5. Export a context pack once the likely edit files are known.
6. Stop opening files once the answer and evidence cover the immediate task.

Example terminal workflow:

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query where-to-add "add initial profile setup steps after user registration" --workspace . --context WebUI --format agent
kraken-atlas query flow "profile setup after registration" --workspace . --context WebUI --format agent
kraken-atlas context where-to-add "add initial profile setup steps after user registration" --workspace . --context WebUI --format md
```

### Direct Map Queries For Agents

Agents do not have to start with `where-to-add` or `flow`. When the agent already has an anchor such as a property, class, method, route, selector, file, config key, or graph id, it should query the map directly before opening source.

Use this loop:

1. `project` to choose the right context.
2. `search` or `symbol` to find an anchor.
3. `relationships` to inspect graph edges around the anchor.
4. `references` to retrieve source usages plus connected implementation, registration, injection, and call edges.
5. `context` only after the useful source slice is clear.

Examples:

```powershell
kraken-atlas query search "ConfigJson carousel" --workspace . --context WebUI --format agent
kraken-atlas query orphans "legacy" --workspace . --context WebUI --format agent
kraken-atlas query duplicates --workspace . --context WebUI --format agent
kraken-atlas query symbol "ComposableEditorPartViewModel" --workspace . --context WebUI --format agent
kraken-atlas query references "ComposableEditorPartViewModel" --workspace . --context WebUI --format agent
kraken-atlas query references "ITranslationDictionaryService" --workspace . --context WebUI --format agent
kraken-atlas query relationships "ConfigJson" --workspace . --context WebUI --format agent
kraken-atlas query relationships "ConfigJson" --workspace . --context WebUI --edge WRITES_FIELD --limit 20 --format agent
kraken-atlas context relationships "ConfigJson" --workspace . --context WebUI --format md
```

Use `--format json` when an agent or tool needs structured output instead of compact prose.

---

## Real-World Use Cases

### Find Where To Add Code

You know the change, but not the right files.

Run:

```text
Kraken Atlas: Suggest Where To Add Code
```

Example request:

```text
add a required home port field to user profiles
```

Kraken Atlas returns a ranked shortlist with evidence from symbols, relationships, routes, services, config usage, and detected patterns.

### Trace An Existing Feature

You need to understand how behavior moves through the app.

Run:

```text
Kraken Atlas: Trace Feature Flow
```

Good queries include:

```text
login
profile editing
image upload
email sending
admin approval
```

### Understand A File Or Symbol

You have a class, method, interface, or file and need nearby context.

Use:

```text
Kraken Atlas: Show Relationships
Kraken Atlas: Find Symbol
Kraken Atlas: Find References
```

### Create A Small Context Pack

When results have narrowed the task, run:

```text
Kraken Atlas: Export Context Pack
```

The generated `.kraken-atlas/context-pack.md` gives an AI agent the files and evidence needed for the next edit without turning the whole repo into prompt context.

### Check Map Quality

When results seem stale, incomplete, or too broad, run:

```text
Kraken Atlas: Check Map Health
```

It reports missing maps, stale files, analyzer diagnostics, excluded-file counts, and suggested fixes.

### Review Orphaned Or Duplicate Code

Use `Kraken Atlas: Find Orphaned Code Candidates` to inspect private/internal C# methods with no mapped incoming static evidence. Use `Kraken Atlas: Find Duplicate Code Blocks` to inspect exact normalized method-body groups. Both commands return file and line evidence for review; neither recommends automatic deletion or consolidation.

---

## Agent Query Playbooks

| Task | Start With | Expand Only If Needed |
| --- | --- | --- |
| Add or change a field | `where-to-add "add field-name to feature-name"` | `relationships "Returned/File.cs"` for model/entity, form/view, handler/controller, service, data, and validation files. |
| Add validation or authorization | `where-to-add "add validation for request-name"` | Validator, request/model, controller/page handler, service, and auth relationships. |
| Add an endpoint or handler | `where-to-add "add endpoint for feature-name"` | `flow "nearest existing endpoint or route"` to mirror the local route/controller/page/service pattern. |
| Add a setting or option | `where-to-add "add setting for feature-name"` | `USES_OPTIONS`, `BINDS_OPTIONS`, and `USES_CONFIG_KEY` relationships. |
| Trace a bug | `flow "bug symptom or behavior"` | `search "exact error message or UI label"` when the first flow is weak. |
| Find where a UI action posts | `flow "button or form action name"` | `POSTS_TO`, `HANDLES_EVENT`, `CALLS`, and `MAPS_ROUTE` relationships. |
| Find who calls a service method | `references "InterfaceOrMethodName"` | Follow returned implementation, DI registration, constructor/Razor injection, and call edges; use `relationships` for a narrower exact hop. |
| Find where data is persisted | `where-to-add "persist field-or-entity-name"` | Entity/model, DbContext/DbSet, repository, service, and related entry-point files. |
| Inspect a known map anchor | `relationships "PropertyOrSymbolOrFile"` | Use `--edge <type>` and `--limit <n>` to inspect focused graph edges before opening files. |
| Review likely orphaned methods | `orphans "optional filter"` | Verify dynamic/framework/external usage with `relationships`, `references`, and focused source inspection before deletion. |
| Review duplicate method bodies | `duplicates "optional filter"` | Compare all returned file/line instances and confirm shared ownership before extracting common code. |

In parent workspaces, include `--workspace . --context ProjectOrFolderName --format agent`. Export a context pack only after query results identify the likely edit files.

---

## What Kraken Atlas Maps

Kraken Atlas indexes:

- Files, language guesses, project boundaries, and project metadata.
- C# symbols, references, method calls, constructors, interfaces, implementations, return types, and project references.
- ASP.NET Core routes, minimal API endpoints, DI registrations, options/config usage, middleware, hosted services, request handlers, validation/auth patterns, and repository/data-flow signals.
- Razor `@inject` services and injected method calls, Razor/HTML forms, DOM hooks, script/style references, selectors, vanilla JavaScript event handlers, fetch calls, browser query-string reads/writes, and browser-history writes.
- Detected patterns such as controller-service flow, constructor injection, service registration, options/config usage, HTML form handlers, and vanilla JS DOM bindings.
- Derived code-health findings for conservative C# orphan candidates and exact normalized duplicate method bodies.

Planned map enrichment will add clearer lifecycle semantics around stateful code, such as declaration, assignment, display, browser field write, model binding, storage write, storage read, config read, and route/handler entry points. The goal is to let agents ask where a value is declared, changed, shown, persisted, or retrieved without opening broad source files.

Relationship and flow queries include endpoint node locations where Kraken Atlas can resolve them. Symbol endpoints include file/range data; file and synthetic endpoints fall back to first-line or relationship-evidence approximations so agents still have a place to inspect.

---

## Command Palette Reference

Open `Ctrl+Shift+P` and run:

| Command | Use It When |
| --- | --- |
| `Kraken Atlas: Rebuild Map From Workspace` | Mapping a workspace for the first time or after broad C# project changes. |
| `Kraken Atlas: Update Map For Changed Files` | Refreshing a map after normal edits. |
| `Kraken Atlas: Check Map Health` | Checking missing, stale, degraded, or incomplete map data. |
| `Kraken Atlas: Show Project Summary` | Seeing indexed projects, language counts, analyzer runs, and guidance. |
| `Kraken Atlas: Find Symbol` | Looking for a class, method, interface, file, or symbol. |
| `Kraken Atlas: Find References` | Finding source usages plus connected implementation, DI registration, constructor/Razor injection, and call edges for a known symbol. |
| `Kraken Atlas: Show Relationships` | Exploring dependencies, callers, implementations, routes, config usage, or project references. |
| `Kraken Atlas: Show Detected Pattern` | Inspecting repeated conventions such as service registration or controller-service flow. |
| `Kraken Atlas: Show Pattern Map` | Seeing detected architecture areas and the strongest patterns to follow before planning edits. |
| `Kraken Atlas: Find Orphaned Code Candidates` | Reviewing private/internal C# methods with no mapped incoming static evidence. |
| `Kraken Atlas: Find Duplicate Code Blocks` | Reviewing exact normalized duplicate C# method bodies. |
| `Kraken Atlas: Trace Feature Flow` | Following behavior through UI, route, service, repository, and related code. |
| `Kraken Atlas: Suggest Where To Add Code` | Getting likely edit locations for a requested change. |
| `Kraken Atlas: Search Map` | Searching indexed map text before opening files. |
| `Kraken Atlas: Export Context Pack` | Writing a bounded markdown context pack for an agent. |
| `Kraken Atlas: Install Agent Instructions` | Creating or updating workspace `AGENTS.md` guidance. |
| `Kraken Atlas: Install CLI For Workspace Terminals` | Enabling `kraken-atlas` in new VS Code integrated terminals for this workspace. |
| `Kraken Atlas: Install AI Agent Setup` | Installing both `AGENTS.md` guidance and the workspace terminal CLI shim. |
| `Kraken Atlas: Open Map Folder` | Inspecting generated map files directly. |

---

## CLI Reference For Agents

After installing the workspace terminal CLI shim, agents can run:

```powershell
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query where-to-add "add initial profile setup steps after user registration" --workspace . --context WebUI --format agent
kraken-atlas query flow "profile setup after registration" --workspace . --context WebUI --format agent
kraken-atlas query relationships "Kelp2025_WebUI/Services/KelpUserManager.cs" --workspace . --context WebUI --format agent
kraken-atlas query relationships "ConfigJson" --workspace . --context WebUI --edge WRITES_FIELD --limit 20 --format agent
kraken-atlas query references "KelpUserManager" --workspace . --context WebUI --format agent
kraken-atlas query references "ITranslationDictionaryService" --workspace . --context WebUI --format agent
kraken-atlas query symbol "RegisterModel" --workspace . --context WebUI --format agent
kraken-atlas query search "profile setup registration" --workspace . --context WebUI --format agent
kraken-atlas context where-to-add "add initial profile setup steps after user registration" --workspace . --context WebUI --format md
```

If the agent cannot find `kraken-atlas` but the shim exists, use `.\.kraken-atlas\bin\kraken-atlas.cmd` in place of `kraken-atlas`.

`query references` is the preferred direct query for a known interface, class, or method. It combines source-reference rows with connected graph edges such as `IMPLEMENTS`, `REGISTERS`, `INJECTS`, `RAZOR_INJECTS`, and `CALLS_INJECTED_SERVICE`. Empty results are still not proof that a symbol is unused in generated code, reflection, or dynamic framework usage.

The installed project skill mirrors the same workflow:

```text
.agents/
  skills/
    kraken-atlas/
      SKILL.md
      .kraken_atlas_version
      references/
        query-playbooks.md
```

Agents that understand local skills can load `/kraken-atlas` or discover the skill metadata from that folder.

Use `--format agent` for compact output. Use `--format info` for richer human-readable detail.

Kraken Atlas also ships [AGENT_SKILL.md](./AGENT_SKILL.md), a short skill-style guide agents can use to apply Kraken Atlas consistently.

Native VS Code language-model tools are also contributed for agent surfaces that support extension tools:

- `kraken_atlas_doctor`
- `kraken_atlas_query`
- `kraken_atlas_context_pack`

These language-model tools are read-only query helpers that return compact Kraken Atlas output without requiring the agent to run shell commands.

---

## Configuration And Ignore Rules

Kraken Atlas excludes common generated and tool-output folders by default, including `.kraken-atlas`, `graphify-out`, `artifacts`, `Sandbox`, `Sandbox_old`, `node_modules`, `bin`, `obj`, `dist`, `build`, and `coverage`.

Tune indexing with VS Code settings:

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

---

## Generated Files

Kraken Atlas writes map data under `.kraken-atlas/`, including:

- `manifest.json`
- `project.json`
- `files.jsonl`
- `symbols.jsonl`
- `references.jsonl`
- `relationships.jsonl`
- `patterns.jsonl`
- `findings.jsonl`
- `conventions.md`
- `agent-readme.md`
- `index.sqlite`
- `context-pack.md`, generated on demand

These files are meant for local agent queries and inspection. They are usually workspace artifacts, not source code.

---

## Current Scope

Strongest support today:

- C# and .NET Core.
- ASP.NET Core MVC, minimal APIs, Razor Pages, services, options/config, hosted services, middleware, and common validation/auth conventions.
- Razor/HTML and vanilla JavaScript relationships.
- Terminal and Command Palette workflows for AI coding agents.
- Queryable C# orphan and exact duplicate callable-body candidates.

Deferred or future work:

- First-class React and Node.js support.
- MCP server workflow.
- Human-facing visual graph browsing.
- Static HTML report generation.

---

## Known Limits

- C# semantic changes can trigger full rebuilds.
- Query quality is strongest for common ASP.NET Core, Razor/HTML, and vanilla JavaScript patterns.
- EF support covers common `DbContext` and `DbSet` reads and writes, but deeper provider-specific behavior and migrations are not fully modeled.
- Validation/auth, hosted-service, middleware, and request-handler coverage is convention-based; unusual framework wrappers may need future analyzer rules.
- Orphan detection is conservative and C#-only. Static absence is not proof of dead code; reflection, dynamic calls, framework conventions, generated code, and external consumers can be invisible.
- Duplicate detection currently finds exact normalized C# callable bodies above a size threshold. Near duplicates, JavaScript functions, and arbitrary in-method block clones are future work.

---

## Alpha Feedback

Kraken Atlas is in alpha, so the best feedback is a query that can become a regression test.

Please report:

- wrong `where-to-add` file rankings
- missing relationships or patterns
- noisy `Next Commands`
- oversized `--format agent` output
- setup, rebuild, update, or CLI install problems

Use [ALPHA_FEEDBACK.md](ALPHA_FEEDBACK.md) for the commands and details to include. The GitHub issue templates are organized around recommendation quality, missing relationships, setup problems, and token/context noise.

---

## Contributor And Local VSIX Testing

This section is for contributors building the extension from source. Normal extension users should start with the Quick Start above.

```powershell
npm install
npm test
npm run check:vsix
code --install-extension ..\pack-artifacts\kraken-atlas-0.1.26.vsix --force
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
