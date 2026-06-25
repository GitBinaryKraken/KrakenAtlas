# Kraken Atlas Agent Skill

Use Kraken Atlas to reduce context before editing. The goal is to find the smallest reliable source slice for the task.

## Query Loop

Agents need a callable CLI in their VS Code terminal. The normal setup is:

1. Ask the user to run `Kraken Atlas: Install AI Agent Setup` from `Ctrl+Shift+P`.
2. Close old VS Code terminals and open a new integrated terminal.
3. Verify `kraken-atlas --help`.
4. Run `kraken-atlas doctor --workspace . --format agent`.
5. Choose `--context ProjectOrFolderName` in parent workspaces.
6. Use `plan-change` for planned feature implementation.
7. Use `where-to-add` for focused edit-location questions.
8. Use `flow` for existing behavior.
9. Use `relationships` for a known file or symbol.
10. Use direct map queries when you already have an anchor such as a property, class, method, route, selector, file, config key, or graph id.
11. Use `search` only as fallback discovery.
12. Use `orphans`, `duplicates`, and `drift` for review candidates, never automatic cleanup or refactoring.
13. Use `context` only after narrowing the target.
14. Stop when `Open These Files` and `Evidence` answer the immediate task.

If `kraken-atlas` is not recognized, do not assume a global install is needed. Some agent terminals do not inherit VS Code's integrated-terminal PATH settings. If the workspace shim exists, use it directly:

```powershell
.\.kraken-atlas\bin\kraken-atlas.cmd --help
.\.kraken-atlas\bin\kraken-atlas.cmd doctor --workspace . --format agent
```

Only ask the user to run the workspace CLI installer command above when `.kraken-atlas/bin/kraken-atlas.cmd` or `.kraken-atlas/bin/kraken-atlas` is missing.

If the VS Code agent surface exposes extension-contributed language-model tools, prefer these read-only tools before terminal commands:

- `kraken_atlas_doctor`
- `kraken_atlas_query`
- `kraken_atlas_context_pack`

Use the terminal CLI when those tools are unavailable or when the agent needs copy/paste command evidence.

## Command Examples

```bash
kraken-atlas --help
kraken-atlas doctor --workspace . --format agent
kraken-atlas query project --workspace . --format agent
kraken-atlas query plan-change "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query where-to-add "requested change" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query flow "feature or behavior" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "FileOrSymbolName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query relationships "PropertyOrSymbolName" --workspace . --context ProjectOrFolderName --edge WRITES_FIELD --limit 20 --format agent
kraken-atlas query references "SymbolOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query symbol "ClassOrMethodName" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query search "natural language terms" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query orphans "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query drift "optional filter" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas context plan-change "requested change" --workspace . --context ProjectOrFolderName --format md
```

## Direct Map Query Loop

When you know the object you care about, query the atlas directly before opening source:

1. `project` to choose the context.
2. `search` or `symbol` to find the anchor.
3. `relationships` to inspect graph edges around the anchor.
4. `references` to verify semantic usage when available.
5. `context` to package only the narrowed source slice.

Use direct map queries for questions like:

- Where is this property written?
- Where is this value displayed?
- Which route, form, selector, or handler touches this symbol?
- Which storage or repository edges are connected?
- Which project or file owns this graph id?

## Token-Saving Rules

- Do not start with broad folder reads or recursive source scans when `.kraken-atlas` exists.
- Treat `Open These Files` as the maximum initial read list.
- Follow `Next Commands` one hop at a time.
- Keep `--workspace`, `--context`, and `--format agent` on follow-up commands.
- Treat empty `references` output as a coverage signal, not proof a symbol is unused. Follow the returned relationship/search fallback commands for Razor markup, model binding, generated code, string conventions, reflection, or dynamic framework usage.
- Treat `orphans` as candidates only. Verify reflection, dynamic/framework invocation, generated code, and external consumers before deletion.
- Treat `duplicates` as exact normalized callable-body groups. Confirm duplication is unintentional before consolidating code.
- Treat `drift` as pattern-review candidates. Verify local intent and nearby examples before changing architecture.
- Prefer `--format agent` for compact output.
- Use `--format info` when a human-readable expanded answer is needed.
- Create a context pack for handoff with `kraken-atlas context plan-change "requested change" --workspace . --context ProjectOrFolderName --format md`.

## Playbooks

Use `ProjectOrFolderName` for the app you are editing. In parent workspaces, do not omit `--context` unless the map has only one project.

### Add Or Change A Field

Start:

```bash
kraken-atlas query plan-change "add field-name to feature-name" --workspace . --context ProjectOrFolderName --format agent
```

Inspect the top model/entity, form/view, controller/page model, service, repository/data, and validation files returned. Expand only the files you will edit:

```bash
kraken-atlas query relationships "Returned/File.cs" --workspace . --context ProjectOrFolderName --format agent
```

Stop when the returned files cover storage, binding, validation, and display/update behavior.

### Add Validation Or Authorization

Start:

```bash
kraken-atlas query plan-change "add validation for request-name" --workspace . --context ProjectOrFolderName --format agent
```

Inspect validator, request/model, controller/page handler, service, and authorization evidence. Expand validator or handler relationships only if the first answer lacks the actual rule location.

### Add An Endpoint Or Handler

Start:

```bash
kraken-atlas query where-to-add "add endpoint for feature-name" --workspace . --context ProjectOrFolderName --format agent
```

Then:

```bash
kraken-atlas query flow "nearest existing endpoint or route" --workspace . --context ProjectOrFolderName --format agent
```

Follow the existing route/controller/page/service pattern. Open `Program.cs` only when the task involves routing, DI, middleware, startup, config, or options.

### Add A Setting Or Option

Start:

```bash
kraken-atlas query where-to-add "add setting for feature-name" --workspace . --context ProjectOrFolderName --format agent
```

Inspect options/config binding, option consumers, DI registration, and affected service files. Expand `USES_OPTIONS`, `BINDS_OPTIONS`, or `USES_CONFIG_KEY` relationships.

### Trace A Bug

Start with the observed behavior:

```bash
kraken-atlas query flow "bug symptom or behavior" --workspace . --context ProjectOrFolderName --format agent
```

If the flow is weak, run:

```bash
kraken-atlas query search "exact error message or UI label" --workspace . --context ProjectOrFolderName --format agent
```

Open only the files in the failing path first. Do not inspect unrelated same-name features in other projects unless relationships point there.

### Find Where A UI Action Posts

Start with the button, form, route, or label:

```bash
kraken-atlas query flow "button or form action name" --workspace . --context ProjectOrFolderName --format agent
```

Inspect Razor/HTML form, vanilla JS event/fetch, route, controller/page handler, and service evidence. Expand `POSTS_TO`, `HANDLES_EVENT`, `CALLS`, and `MAPS_ROUTE`.

### Find Who Calls A Service Method

Start:

```bash
kraken-atlas query relationships "ServiceOrMethodName" --workspace . --context ProjectOrFolderName --format agent
```

For an interface-based service, start with the interface through `references`; Kraken Atlas returns connected implementations, DI registrations, constructor/Razor injection sites, and injected calls when mapped. Use an exact `relationships` follow-up for one implementation or method.

### Find Where Data Is Persisted

Start:

```bash
kraken-atlas query where-to-add "persist field-or-entity-name" --workspace . --context ProjectOrFolderName --format agent
```

Inspect entity/model, DbContext/DbSet, repository read/write methods, service methods, and then UI/controller entry points. Expand `WRITES`, `QUERIES`, `USES_DBSET`, and `CALLS_REPOSITORY`.

### Inspect A Known Map Anchor

Start with the most concrete value you have:

```bash
kraken-atlas query relationships "PropertyOrSymbolOrFile" --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query references "InterfaceOrMethodName" --workspace . --context ProjectOrFolderName --format agent
```

For stateful fields and hidden inputs, narrow by edge type:

```bash
kraken-atlas query relationships "ConfigJson" --workspace . --context ProjectOrFolderName --edge WRITES_FIELD --limit 20 --format agent
```

Open files only after the relationship evidence shows whether the anchor is declared, assigned, displayed, model-bound, persisted, or retrieved. Some of those lifecycle labels are still being enriched, so prefer current edge evidence over assumptions.

### Create Compact Handoff Context

After narrowing:

```bash
kraken-atlas context where-to-add "requested change" --workspace . --context ProjectOrFolderName --format md
```

### Review Code-Health Findings

```bash
kraken-atlas query orphans --workspace . --context ProjectOrFolderName --format agent
kraken-atlas query duplicates --workspace . --context ProjectOrFolderName --format agent
```

For each orphan candidate, run a focused `relationships` or `references` follow-up and inspect dynamic/framework entry conventions before deletion. For duplicate groups, compare every returned location and establish shared ownership before extracting common code.

## Stop Conditions

- Stop after the top files provide enough evidence for the edit.
- Stop when a context pack contains the edit files, reasons, and relationship evidence.
- Ask for a narrower query or exact `--context` if results are ambiguous.

## Measure Success

- Fewer files opened.
- Fewer source lines pasted.
- Fewer exploratory searches.
- Top recommendations include the eventual edit files.
- Context pack is small enough to review in one agent turn.
