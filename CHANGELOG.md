# Changelog

## Unreleased

- Continued the behavior-preserving `reactAnalyzer.ts` split by extracting shared source-text scanning and ID helpers, route/store/context conventions, compiler-AST TypeScript declaration/type-parameter discovery, JSX composition/prop evidence, and TypeScript prop/interface/enum member discovery into focused modules.
- Continued the next `queryService.ts` split by extracting project metadata, symbol lookup, code-health, references, relationships, pattern, pattern-map, hotspots, search, exact-file, flow-context, endpoint-location, and where-to-add orchestration helpers into focused modules.
- Split the oversized query-service test file into core, where-to-add/context-pruning, and search/reference/relationship/flow suites.
- Split the oversized web-analyzer test file into Razor/HTML, JavaScript-flow, React prop/type, and React route/workflow suites.

## 0.2.3

- Refreshed React/TypeScript roadmap, feedback, known-limits, and handoff docs so they distinguish shipped compiler-backed slices from remaining first-pass semantic gaps.
- Started a behavior-preserving `reactAnalyzer.ts` split by extracting shared analyzer types, generic prop evidence helpers, prop utility/index-signature helpers, import/re-export name helpers, and type-text utilities into focused modules.
- Expanded inferred React prop extraction for nested destructured parameters, rest props, and simple default-value type/optionality hints, backed by a repo-local React fixture.
- Added first-pass broad `Record<string, T>` and TypeScript index-signature prop members, including JSX fallback edges for attributes covered by string index signatures.
- Added finite template-literal key expansion for utility props such as ``Record<`data-${"tone" | "size"}`, string>``.
- Added first-pass generic React function component parsing with type-parameter nodes, typed props ownership, and JSX type-argument edges.
- Added first-pass JSX type-argument substitution in generic React prop-flow evidence, so prop pass edges show concrete use-site types such as `TValue=PickerValue` and `type: PickerValue[]`.
- Added first-pass generic props-alias parameter remapping so component generics such as `AliasPicker<TItem>` can substitute props members declared on `AliasPickerProps<TOption>`.
- Added first-pass local generic type-alias expansion in React prop-flow evidence, so aliases such as `PickerOptionList<TOption>` can resolve to concrete use-site types.
- Added imported nested generic type-alias expansion in React prop-flow evidence, following type imports before recursively expanding alias chains.
- Added defaulted generic JSX substitution in React prop-flow evidence when a component omits explicit type arguments but declares generic defaults.
- Added queryable TypeScript generic type-parameter nodes and `HAS_TYPE_PARAMETER` relationships for React/TypeScript semantic declarations.
- Added first-pass discriminated-union variant nodes and `HAS_UNION_VARIANT` relationships for object-literal union type aliases.
- Added exported API/client contract patterns for exported TypeScript interfaces, aliases, props, and enums under `types`, `api`, or `services` folders.
- Resolved React/TypeScript function calls through imported module bindings when possible, emitting `react-imported-call` references for compiler-resolved call graph evidence.
- Added `REFERENCES_TYPE` edges from TypeScript member and generic parameter nodes to known local type declarations.
- Added first-pass `ComponentProps<typeof Component>` alias relationships so derived prop aliases can point back to the component whose props they mirror.
- Resolved namespace imported function calls such as `WorkflowClient.fetchWorkflowSnapshot()` to imported declarations instead of relying on global name matching.
- Added literal union value nodes for scalar TypeScript unions such as `"ready" | "blocked"`.
- Added declaration-level `REFERENCES_TYPE`, `USES_GENERIC_TYPE`, and `USES_TYPE_ARGUMENT` edges so aliases and generic contracts point at their composed local types.
- Resolved imported hook and store calls through import bindings, including namespace-style calls, before falling back to name-only hook matching.
- Resolved JSX default import aliases through default barrel re-exports so aliased tags such as `<ShellViaDefault />` point back to the actual component and prop members.
- Added first-pass mixed JavaScript/TypeScript React fixture coverage with a `.jsx` component exported through a TypeScript barrel.
- Added import-resolved evidence markers to resolved React call and hook relationships so agent queries can distinguish stronger semantic edges from local name matches.
- Resolved named import and re-export aliases such as `WorkflowShell as ShellFromBarrel` and `LegacyWorkflowNote as LegacyNote` through React barrel files.
- Resolved imported React prop type aliases such as `WorkflowSummaryCardProps as SummaryCardProps` so component prop ownership and JSX `PASSES_PROP` edges point at shared prop declarations.
- Added first-pass inherited React props mapping with `EXTENDS_PROPS` edges and JSX prop resolution through inherited prop members.
- Added first-pass TypeScript utility-prop member resolution for `Pick`, `Omit`, `Partial`, `Required`, and `Readonly`, preserving JSX prop edges to the underlying source prop members.
- Added first-pass inferred React props for untyped destructured component parameters, including JavaScript/JSX components, so `DECLARES_PROP` and JSX `PASSES_PROP` edges can target inferred prop nodes.
- Added finite-key `Record<K, V>` and simple mapped-type prop member resolution, including keys sourced from local literal-union aliases.
- Validated the expanded React/TypeScript semantic coverage and analyzer refactor slices with 87 automated tests.

## 0.2.2

- Added TypeScript project discovery that emits queryable `tsconfig.json`, package, path-alias, and TypeScript project-reference map facts as the first foundation slice for compiler-backed semantic analysis.
- Resolved React/TypeScript imports through TypeScript's compiler module resolver using discovered `tsconfig` settings, so alias imports such as `@components` can connect to barrel files and implementation files with compiler-backed confidence.
- Added compiler-AST TypeScript declaration extraction for React/TypeScript maps, including queryable interface, object type-alias, scalar type-alias, enum, enum-member, and member summary nodes.
- Split React/TypeScript type-only imports into `TYPE_IMPORTS_MODULE` relationships and `typescript-type-import` references so contract dependencies are distinct from runtime module composition.
- Connected JSX `PASSES_PROP` relationships to real declared prop member nodes when the rendered component has a known props type.
- Added first-pass intersection props extraction for aliases such as `type FooProps = BaseProps & { localProp?: string }`, surfacing the inline object members as queryable prop nodes.
- Resolved JSX namespace component usage such as `<Components.Widget />` through namespace imports and barrel re-exports so render and prop edges point at the actual component.
- Added queryable package export nodes from `package.json` `exports`, `main`, `module`, and `types` fields as groundwork for package-export-aware module resolution.
- Connected package export nodes to exported local files and used workspace package `exports` to resolve React/TypeScript package-subpath imports.
- Resolved default imports through default barrel re-exports such as `export { default } from "./Component"`.
- Preserved parallel React relationship evidence for repeated edges from the same source to the same target, so separate import paths no longer collapse during analyzer deduplication.
- Verified the full suite at 84 passing tests after the TypeScript semantic-analysis expansion.

## 0.2.1

- Scrubbed public Atlas documentation, generated agent instructions, release history audit output, and packaged release notes so private regression-project names are not exposed to alpha testers.
- Added a release validation guard that fails if public/package-facing docs reintroduce private fixture wording.
- Added a TypeScript semantic-analysis roadmap for the `0.2.x` line, including TypeScript project discovery, compiler-backed import/export resolution, type-checker-backed JSX prop mapping, and semantic confidence labels.

## 0.2.0

- Added first-pass React/TypeScript analyzer support for `.ts`, `.tsx`, and `.jsx` files, including component, hook, context, route, prop, event, import, and API-route relationships.
- Added React pattern-map categories for component composition, hook/context flow, and route/API flow.
- Added React-aware SQLite role enrichment and `ReactAgentDashboard` regression coverage.
- Added React/TypeScript props and interface member extraction, including component-to-prop member relationships and SQLite `node_members` enrichment.
- Added React export hardening for named default components plus wrapper-assigned `memo(...)` and `forwardRef(...)` components.
- Added React route-object detection for `Component`, `component`, and JSX `element` route styles in addition to existing `componentName` mappings.
- Added React state-store detection for store hooks, `USES_STORE` relationships, state-store roles, and a state-store pattern-map category.
- Added `ReactWorkflowBoard` as a second React fixture covering route objects under `src/routes`, store hooks under `src/state`, JSX components, and service calls with object-shaped TypeScript return types.
- Documented Graphify plus Obsidian transcript takeaways as a later optional Markdown/Obsidian export path, scoped behind React hardening and context-pack polish.
- Added React/TypeScript-specific alpha feedback prompts for component, prop, hook, context, store, route, event, API-call, import/export, pattern-map, and token-noise misses.
- Added React prop/member extraction for object-shaped TypeScript aliases such as `type FooProps = { ... }`.
- Added Next.js-style file-route detection for `app/**/page.tsx` and `pages/**/*.tsx`, backed by the `ReactNextPortal` fixture.
- Added React prop/member ownership for `React.FC<Props>`, `FC<Props>`, and `FunctionComponent<Props>` typed components.
- Added React barrel re-export resolution for imports through `index.ts` files, including `RE_EXPORTS_MODULE` relationships and implementation-file `IMPORTS_MODULE` edges.
- Added nested React/TypeScript member hints such as `params.workflowId`, lightweight Next.js client/server roles, and Next `app/api/**/route.ts` route-handler mapping.
- Verified the full suite at 84 passing tests after the React/Next integration coverage.

## 0.1.30

- Added rebuild-time SQLite enrichment tables for node projects, roles, tags, members, and usage summaries so agents can query shared datatype boundaries and likely edit surfaces without broad source reads.
- Surfaced matched node tags, project/role/member guidance, and shared-contract boundary warnings in `where-to-add`, `plan-change`, agent output, and context packs.
- Added shared-contract implementation checklists for cross-project request/response DTO changes, including contract shape, producer mappings, API consumers, validation/binding, client serialization, and tests.
- Pruned context-pack relationship evidence with selected files, compound feature tags, shared-contract boundaries, and project membership to reduce unrelated graph noise.
- Added a real multi-project regression fixture that rebuilds WebUI, API, shared-domain, and logic-layer projects and verifies focused shared-contract context packs.
- Split query internals into focused modules for planning, recommendation guidance, context pruning, shared contracts, value-lifecycle lookup, flow, search, references, hotspots, text helpers, and evidence shaping.
- Added roadmap documentation for React/JSX/TypeScript analyzer work as the next `0.2.0` milestone; the full suite now has 78 tests.

## 0.1.29

- Improved `flow` coverage for exact requested metadata/property anchors such as `MetaDescription` and `MetaKeywords`, so scoped page-editor traces keep adjacent mapping/model-binding evidence instead of reporting those fields as missing.
- Matched singular/plural query concepts consistently in flow coverage, including prompts such as `saves` against `SaveDraftPage`.
- Added WebUI regression coverage for the page metadata panel flow; the full suite now has 67 tests.

## 0.1.28

- Improved `where-to-add` ranking for ASP.NET Core Identity user-shape changes so phrases such as `new user variable` and `new aspect user parameter` promote custom Identity user models and DbContext files instead of unrelated controllers.
- Preserved endpoint/controller ranking for explicit endpoint, route, API, and controller requests so user-flow edits still start from the route layer when appropriate.
- Added WebUI regression coverage for Identity user property discovery; the full suite remains at 66 tests.

## 0.1.27

- Added `query plan-change` plus Command Palette and language-model tool support for one-step implementation planning that combines likely edit files, pattern-fit guidance, hotspot/drift risk checks, and a context-pack command.
- Added `query pattern-map` plus Command Palette and language-model tool support for architecture pattern overviews grouped by detected area.
- Added explicit pattern-fit evidence to `where-to-add` so agents see which local convention to copy before opening files.
- Added `query hotspots` plus Command Palette and language-model tool support for cautious architecture hotspot discovery over central/shared graph files.
- Added first `query drift` candidates for controllers that bypass service delegation and services that bypass repository data-flow patterns.
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

Agent-output precision follow-up from the `0.1.24` multi-project evaluation.

- Preserved `--workspace`, `--context`, and `--format agent` in context-pack follow-up commands.
- Added exact handling for filename-shaped search queries, including an explicit absent-from-index result instead of noisy fuzzy fallback.
- Filtered validation, persistence, browser-state, and configuration context-pack evidence by requested concern and labeled text-only discovery when no direct concern edge exists.
- Replaced clipped `where-to-add` reasons with fewer complete relationship or anchor records carrying source line locations.
- Rendered project metadata as a structured workspace, record-count, language, project, schema, and generation-time summary.
- Added regression coverage for all five evaluator gaps; the full suite now has 56 tests.

## 0.1.24

Ranking hygiene and context transparency follow-up from the `0.1.23` multi-project evaluation.

- Included directly connected exact-anchor relationships outside the seed project context and labeled the expansion by edge type, eliminating silent loss of the connector `IMPLEMENTS` edge.
- Excluded `.tmp*` files such as browser page captures from default indexing.
- Added explicit search sampling metadata showing the displayed count and matched candidate count.
- Replaced generic `where-to-add` relationship reasons with concrete edge endpoints and line numbers.
- Removed pattern-only recommendations and page controllers without graph evidence from edit-location results.
- Required strong symbol anchors to match at least one requested concept in the symbol name, preventing generic methods such as `Index` or `Contextual` from being promoted by file-name matches alone.
- Added regression coverage for context expansion, temporary captures, sampling labels, and direct relationship inclusion; the full suite now has 52 tests.

## 0.1.23

Agent-output transparency follow-up from the `0.1.22` multi-project evaluation.

- Fixed exact search results for reference records so compact evidence includes match kind, title, path, line, and source snippet instead of blank `Reference: ->` rows.
- Added aggregate reference breakdowns by source-reference context and connected relationship type.
- Distinguished literal Razor injections from semantically resolved injected method calls.
- Labeled compact evidence as sampled and explained why expansion across all resolved anchors can differ from an exact single-ID relationship follow-up.
- Changed bounded search wording from `Found` to `Showing` so the 20-row result cap is not presented as a corpus-wide total.
- Added formatter and aggregate-count regression coverage; the full suite now has 50 tests.

## 0.1.22

Agent retrieval corrections from the `0.1.21` multi-project evaluation.

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

Agent-query precision improvements from the post-0.1.20 multi-project evaluation.

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

Real-project boolean attribute fix for serialized config fields.

- Parsed boolean HTML/Razor attributes such as `data-config-json` and `data-nearby-config-json`, allowing selector edges and `WRITES_FIELD` edges to connect to hidden inputs that omit explicit attribute values.
- Updated the carousel regression fixture to use a production-style `[data-config-json]` selector.

## 0.1.17

Real-project helper-write detection patch.

- Detected selector variables created through chained DOM calls such as `editor.closest(...).querySelector("[data-config-json]")`.
- Added `WRITES_FIELD` edges for helper-call writers such as `writePartConfig(hiddenInput, payload)` when the first argument is a selector-backed field variable.
- Adjusted context-pack excerpt selection so `file:` relationship targets, such as component `Default.cshtml` views, are not pushed out by multiple source-side excerpts.

## 0.1.16

Agent retrieval and exact-anchor query patch from the third carousel retest.

- Made `relationships` inspect serialized edge evidence, so queries such as `relationships "ConfigJson"` can find `WRITES_FIELD`, `BINDS_MODEL_PROPERTY`, and `MAPS_PROPERTY` edges.
- Added `--edge` and `--limit` support for relationship queries, e.g. `kraken-atlas query relationships "_EditorShell.cshtml" --edge WRITES_FIELD --limit 20`.
- Prioritized relationship output so high-value edge types such as `WRITES_FIELD`, model-binding, and property-mapping edges are visible before generic `CONTAINS` records.
- Anchored multi-term feature-flow ranking on exact identifier-shaped terms such as `ConfigJson`, reducing unrelated generic matches like Identity registration flows in precise persistence queries.
- Added flow caveats when exact anchors or expected lifecycle layers are missing from the visible result.

## 0.1.15

Agent feature-continuity patch from the second carousel retest.

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
