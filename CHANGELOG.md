# Changelog

## Unreleased

- Added `query pattern-map` plus Command Palette and language-model tool support for architecture pattern overviews grouped by detected area.
- Added explicit pattern-fit evidence to `where-to-add` so agents see which local convention to copy before opening files.
- Added `query hotspots` plus Command Palette and language-model tool support for cautious architecture hotspot discovery over central/shared graph files.
- Documented Pattern Map as the first-step workflow for choosing which local convention an agent should follow before `where-to-add`.

## 0.1.26

Queryable code-health findings for AI-agent review.

- Added `finding` records, `findings.jsonl`, SQLite finding indexes, manifest output metadata, and project/build finding counts.
- Added conservative `query orphans` detection for explicit private/internal C# methods with no mapped incoming evidence and no additional textual name occurrence.
- Excluded public methods, overrides, framework lifecycle methods, tests/generated code, and event-handler signatures from orphan candidates.
- Added `query duplicates` for exact normalized C# callable bodies above a meaningful size threshold, grouped with every symbol/file/range location.
- Added context-aware duplicate groups that retain and label directly matching cross-project instances.
- Exposed orphan and duplicate queries through the CLI, Command Palette, and VS Code language-model tools.
- Added upgrade detection so pre-findings maps require a full rebuild rather than failing at query time.
- Added user/agent playbooks, schema/planning documentation, and regression coverage; the full suite now has 59 tests.
- Validated the release on a large multi-project ASP.NET Core/Razor workspace; conservative filtering removed framework/event false positives while retaining actionable exact duplicate groups.

## 0.1.25

Agent-output precision follow-up from the `0.1.24` Kelp evaluation.

- Preserved `--workspace`, `--context`, and `--format agent` in context-pack follow-up commands.
- Added exact handling for filename-shaped search queries, including an explicit absent-from-index result instead of noisy fuzzy fallback.
- Filtered validation, persistence, browser-state, and configuration context-pack evidence by requested concern and labeled text-only discovery when no direct concern edge exists.
- Replaced clipped `where-to-add` reasons with fewer complete relationship or anchor records carrying source line locations.
- Rendered project metadata as a structured workspace, record-count, language, project, schema, and generation-time summary.
- Added regression coverage for all five evaluator gaps; the full suite now has 56 tests.

## 0.1.24

Ranking hygiene and context transparency follow-up from the `0.1.23` Kelp evaluation.

- Included directly connected exact-anchor relationships outside the seed project context and labeled the expansion by edge type, eliminating silent loss of the connector `IMPLEMENTS` edge.
- Excluded `.tmp*` files such as browser page captures from default indexing.
- Added explicit search sampling metadata showing the displayed count and matched candidate count.
- Replaced generic `where-to-add` relationship reasons with concrete edge endpoints and line numbers.
- Removed pattern-only recommendations and page controllers without graph evidence from edit-location results.
- Required strong symbol anchors to match at least one requested concept in the symbol name, preventing generic methods such as `Index` or `Contextual` from being promoted by file-name matches alone.
- Added regression coverage for context expansion, temporary captures, sampling labels, and direct relationship inclusion; the full suite now has 52 tests.

## 0.1.23

Agent-output transparency follow-up from the `0.1.22` Kelp evaluation.

- Fixed exact search results for reference records so compact evidence includes match kind, title, path, line, and source snippet instead of blank `Reference: ->` rows.
- Added aggregate reference breakdowns by source-reference context and connected relationship type.
- Distinguished literal Razor injections from semantically resolved injected method calls.
- Labeled compact evidence as sampled and explained why expansion across all resolved anchors can differ from an exact single-ID relationship follow-up.
- Changed bounded search wording from `Found` to `Showing` so the 20-row result cap is not presented as a corpus-wide total.
- Added formatter and aggregate-count regression coverage; the full suite now has 50 tests.

## 0.1.22

Agent retrieval corrections from the `0.1.21` Kelp evaluation.

- Seeded browser query-state flows from operation-specific graph edges before generic lexical symbol matches.
- Kept browser-state `where-to-add` recommendations on files that own browser read/write/history edges once such evidence is found.
- Distinguished adjacent browser query reads from an implemented browser URL writer and exposed the missing operation in compact agent output.
- Capped browser write-intent confidence when the graph contains reads but no URL mutation edge.
- Ranked semantic relationship edges ahead of structural `CONTAINS` edges for multi-edge filters.
- Rendered relationship filters and capability assessments as compact agent text instead of raw JSON.
- Added regression coverage for C# lexical distractors, absent browser writers, multi-edge fairness, and filter formatting; the full suite now has 48 tests.
- Added exact Razor `@inject` symbols, `RAZOR_INJECTS` edges, and `CALLS_INJECTED_SERVICE` edges resolved to C# interfaces and methods.
- Resolved factory-lambda DI registrations to their concrete implementation type when the registration returns `new Implementation(...)`.
- Expanded direct `references` queries with connected implementation, registration, injection, and call relationships, including graph-connected sibling projects under a scoped context.
- Added end-to-end Razor/interface reverse-traversal coverage; the full suite now has 49 tests.
- Excluded generated `.agents` skill folders and `AGENTS.md` from default indexing so installing agent setup does not immediately mark the map stale.

## 0.1.21

Agent-query precision improvements from the post-0.1.20 Kelp evaluation.

- Calibrated natural-language `flow` confidence from requested-concept coverage, graph connectivity, and text similarity instead of returning a mostly fixed score.
- Added compact positive and negative coverage evidence so agents can distinguish a complete flow from a partial slice and see which requested concepts were not found.
- Added automatic exact-symbol pivots for natural-language flow queries, including controlled cross-project discovery when a scoped project calls behavior implemented in a sibling project.
- Prioritized concrete controller, service, and data-service anchors over DTOs and interfaces while preserving those contracts as follow-up evidence.
- Promoted strong symbol anchors in `where-to-add` and capped its confidence at the underlying flow confidence.
- Added regression coverage for incomplete-flow confidence, exact-symbol pivots, cross-project traversal, and compact agent coverage output; the full suite now has 46 tests.

## 0.1.20

Post-0.1.19 agent-feedback fixes for browser state and natural-language ranking.

- Added JavaScript browser-state nodes and `READS_QUERY_STRING`, `WRITES_QUERY_STRING`, and `WRITES_BROWSER_HISTORY` relationships with source ranges.
- Added semantic flow anchoring for query-string/browser-history prompts so unrelated Identity flows do not leak into compact results.
- Ranked a larger bounded discovery pool before slicing, allowing late-indexed JavaScript relationship records to compete with generic C# text matches.
- Distinguished browser query-string intent from CQRS/request-handler intent so the word `query` does not incorrectly promote every `Handlers/` file.
- Made `where-to-add` confidence account for distinct term coverage and connected feature evidence.
- Added an incomplete-lifecycle caveat and confidence cap when query-string reads exist but no write edge is detected.
- Added a browser query-state fixture and regression coverage; the full suite now has 43 tests.

## 0.1.19

Direct map-query and node-location patch for VS Code agent testing.

- Documented direct map-query workflows for agents that already know an anchor such as a property, symbol, route, selector, file, config key, or graph id.
- Added relationship and flow endpoint location enrichment with `fromLocation` / `toLocation`, including exact symbol file/range data and approximate file/synthetic node locations.
- Updated compact agent output to show endpoint node line hints beside relationship evidence.
- Tracked planned lifecycle/state roles such as declaration, assignment, display, model binding, storage read, and storage write for future direct map queries.

## 0.1.18

Real-Kelp boolean attribute fix for serialized config fields.

- Parsed boolean HTML/Razor attributes such as `data-config-json` and `data-nearby-config-json`, allowing selector edges and `WRITES_FIELD` edges to connect to hidden inputs that omit explicit attribute values.
- Updated the carousel regression fixture to use the Kelp-style `[data-config-json]` selector.

## 0.1.17

Real-Kelp helper-write detection patch.

- Detected selector variables created through chained DOM calls such as `editor.closest(...).querySelector("[data-config-json]")`.
- Added `WRITES_FIELD` edges for helper-call writers such as `writePartConfig(hiddenInput, payload)` when the first argument is a selector-backed field variable.
- Adjusted context-pack excerpt selection so `file:` relationship targets, such as component `Default.cshtml` views, are not pushed out by multiple source-side excerpts.

## 0.1.16

Agent retrieval and exact-anchor query patch from the third Kelp carousel retest.

- Made `relationships` inspect serialized edge evidence, so queries such as `relationships "ConfigJson"` can find `WRITES_FIELD`, `BINDS_MODEL_PROPERTY`, and `MAPS_PROPERTY` edges.
- Added `--edge` and `--limit` support for relationship queries, e.g. `kraken-atlas query relationships "_EditorShell.cshtml" --edge WRITES_FIELD --limit 20`.
- Prioritized relationship output so high-value edge types such as `WRITES_FIELD`, model-binding, and property-mapping edges are visible before generic `CONTAINS` records.
- Anchored multi-term feature-flow ranking on exact identifier-shaped terms such as `ConfigJson`, reducing unrelated generic matches like Identity registration flows in precise persistence queries.
- Added flow caveats when exact anchors or expected lifecycle layers are missing from the visible result.

## 0.1.15

Agent feature-continuity patch from the second Kelp carousel retest.

- Added model-binding and property-mapping bridge edges so hidden fields such as `Parts[].ConfigJson` can connect to C# adapter/request mappings.
- Added first-pass existing-capability evidence in `where-to-add` when the graph already connects UI binding, model/config mapping, and rendering.
- Added flow expansion through shared property names so a natural-language query like `image carousel rendering and editing` can include `ConfigJson` adapter mappings without the user naming `ConfigJson`.
- Updated carousel regression coverage with model-binding, adapter DTO mapping, and existing-capability assertions.

## 0.1.14

Post-0.1.13 polish for AI-agent feature continuity.

- Added Razor/inline-JavaScript regression coverage for carousel-style editors that serialize hidden `ConfigJson` fields.
- Added analyzer relationships for inline script ownership, DOM selector matches, field writers, Razor C# symbol usage, view-component invocations, and conventional component views.
- Tuned feature-flow ranking so `WRITES_FIELD`, `INVOKES_VIEW_COMPONENT`, and `RENDERS_VIEW` evidence appears before lower-value structural edges.
- Added short plural term variants for query matching so prompts such as `carousels` can match `carousel` records without broad stemming.
- Added a cross-language fixture proving `where-to-add`, `flow`, and `relationships` can connect Razor markup, inline JavaScript, C# config models, view components, and component views.
- Added `references` coverage caveats and bounded map-search fallback evidence when semantic reference records are empty, so agents do not treat missing references as proof a symbol is unused.
- Made workspace CLI shims upgrade-safe by resolving the latest installed Kraken Atlas extension at runtime and refreshing existing shims on extension activation.
- Added ASP.NET Core view-component convention edges from `*ViewComponent` classes to `Views/Shared/Components/<Name>/Default.cshtml`, including project-folder-prefixed workspaces.
- Broadened feature-flow composition with bounded domain-term layer expansion so exact feature terms can pull in nearby UI, rendering, project-reference, and data-flow edges.
- Added compact source excerpts to context packs, including snippets for relationship source locations and `file:` relationship targets.

## 0.1.13

Agent setup reliability patch.

- Diversified `query search --format agent` evidence so repeated hits from one file do not crowd out other likely files.
- Added weak multi-term search caveats and lower confidence when top search results only match part of the prompt.
- Tightened `query flow --format agent` so `Open These Files` is based on the visible evidence rows instead of broader hidden flow data.
- Added direct workspace-shim guidance for agent terminals that do not inherit VS Code integrated-terminal PATH settings.
- Added project-local `.agents/skills/kraken-atlas` installation through `install-agent`, `Install Agent Instructions`, and `Install AI Agent Setup`.
- Added regression coverage for search result diversification, weak-match caveats, evidence-backed flow open files, direct shim fallback instructions, and project-local skill installation.

## 0.1.12

Alpha feedback build update after the initial `0.1.11` publish.

- Added a packaged changelog.
- Fixed ambiguous-context CLI responses so they exit cleanly on Windows.
- Added regression coverage for ambiguous partial-context CLI output.
- Included the latest AI-agent output reduction and query-ranking improvements in a new Marketplace-safe version.

## 0.1.11

Alpha feedback build for Kraken Atlas.

- Renamed the extension and CLI to Kraken Atlas.
- Added Command Palette workflows for rebuilding, updating, health checks, project summaries, code-map queries, context packs, AI agent setup, and workspace CLI setup.
- Added terminal-first AI-agent guidance plus optional VS Code language-model tools.
- Added local `kraken-atlas` CLI setup for VS Code workspace terminals.
- Improved `where-to-add` ranking for C#/.NET, ASP.NET Core, Razor/HTML, and vanilla JavaScript projects.
- Added partial and ambiguous `--context` handling for multi-project workspaces.
- Added ignore and corpus controls through defaults and `.kraken-atlas-ignore`.
- Reduced `--format agent` output size for token-conscious AI-agent workflows.
- Fixed ambiguous-context CLI responses so they exit cleanly on Windows.

Known alpha limits:

- First-class support is focused on C#/.NET Core, ASP.NET Core, Razor/HTML, and vanilla JavaScript.
- React and Node.js framework-specific mapping are planned later.
- No visual graph or HTML report surface is included; the product is focused on AI-agent queries and context reduction.
