# Where We Left Off

Date: 2026-07-08

## Current Checkpoint

Use `git log -1 --oneline` for the current committed checkpoint. The release-prep checkpoint captures the `0.2.3` React/TypeScript semantic-analysis work, fixture coverage, and analyzer refactor slices. Public/package docs now present `0.2.3` as the latest packaged alpha.

The product direction has been realigned: Atlas should focus on building better code maps for AI agents, not competing with Roslyn, LSP servers, SourceGraph, NDepend, TypeScript's compiler, or other semantic/indexing tools. Those tools are upstream fact sources. Atlas' job is to normalize source facts into a compact local atlas and add the agent-oriented layer: local patterns, likely edit surfaces, nearest examples, supporting evidence, blast-radius hints, and context reduction.

The product should be judged by map usefulness, not graph completeness. A new relationship or analyzer slice is worth doing when it improves an agent-facing answer such as `where-to-add`, `flow`, `relationships`, `pattern`, `pattern-map`, `plan-change`, or a context pack. Human-facing visualization remains secondary.

The main product thread has moved from the earlier pattern-planning slice into `0.2.x` React/TypeScript hardening. Atlas should still describe this as first-pass React/TypeScript support, but not as purely convention-based anymore: some compiler-backed project, import, declaration, prop, and call slices are now in place.

Latest development also closed a `where-to-add` miss found in the Kelp multi-project test corpus: natural "favorite/pick field on a profile page" prompts now recognize template-backed profile/persona details, cross a WebUI context into AdminTools object/type management, keep PersonaDetailTemplate/TypeCode backing files in the recommendation set, demote runtime PersonaInfo and Identity account distractors, and emit follow-up commands in the recommended file's own context.

The newest slice turns that miss into first-pass data-backed pattern recognition: Atlas now emits database table nodes and SQL table edges, maps generated `*TableDataModel` classes back to table nodes, maps explicit C# type-code enum members to shared `type-code:<value>` nodes, emits conservative SQL seed-row nodes for literal `INSERT` rows, adds source-of-truth roles for admin/config/template/taxonomy/type-code surfaces, detects a `template-backed-runtime-field` pattern, prioritizes that pattern for template-backed profile/detail prompts, and keeps exact table/type-code relationship queries focused on direct graph edges instead of incidental property/text matches.

Latest follow-up added first-pass Dapper type binding, Dapper result projection mapping, and C# model projection synthesis. Atlas now maps generic `QueryAsync<T>`-style calls from touched table nodes to resolved C# result symbols with `MAPS_DAPPER_RESULT`, maps typed `ExecuteAsync` parameters to write tables with `USES_DAPPER_PARAMETER`, maps typed Dapper result variables into domain/data models through direct object initializers with `PROJECTS_DAPPER_ROW` and `MAPS_DAPPER_PROPERTY`, synthesizes type-level `PROJECTS_MODEL` edges from resolved `MAPS_PROPERTY` clusters, includes those edges in relationship queries/flow context/scoring/roles/patterns, prioritizes direct relationship rows before value-lifecycle expansion, and avoids treating `JOIN LATERAL` as a table.

Current active direction: define and harden the agent-readable map contract, then let pattern detection sit on top of that map. The recent Kelp/Dapper/model-projection work is useful supporting infrastructure because it improves the template-backed field answer, but do not keep expanding projection edges unless the next slice is tied to a named pattern or a failing agent query.

Latest map-contract slice made relationship source kinds durable and queryable. Query evidence and compact agent output can distinguish `compiler-resolved`, `source-parsed`, `convention-derived`, `inferred`, and `text-derived` relationship facts; SQLite now stores those labels in `relationships.source_kind`, enriches stored relationship JSON with `sourceKind`, bumps the map schema to `0.1.1`, and `query relationships --source-kind <kind>` can filter by provenance. Older maps are marked stale for rebuild, with an in-memory compatibility fallback for direct queries. Next apply the same provenance idea to pattern summaries and context packs.

## React/TypeScript Support State

Packaged `0.2.0` completed the first React analyzer milestone:

- `.jsx`, `.ts`, and `.tsx` language detection.
- Components, hooks, context providers/consumers, routes, stores, props, JSX events, imports, and API/fetch calls.
- React relationships such as `RENDERS_COMPONENT`, `USES_HOOK`, `USES_STORE`, `PASSES_PROP`, `PROVIDES_CONTEXT`, `CONSUMES_CONTEXT`, `HANDLES_EVENT`, `IMPORTS_MODULE`, `MAPS_ROUTE`, and `CALLS_API_ROUTE`.
- Route object styles, Next-style file routes, lightweight `"use client"` / `"use server"` roles, and Next `app/api/**/route.ts` handlers.
- Object-shaped props aliases, `React.FC<Props>` / `FC<Props>` / `FunctionComponent<Props>` prop ownership, nested prop hints such as `params.workflowId`, and React barrel re-export resolution.
- Regression coverage across Vite-style React apps, route/state organization variants, Next-style file routes, and mixed `.jsx` / TypeScript barrel paths.

Packaged `0.2.2` added the TypeScript semantic foundation:

- Queryable TypeScript project facts from `tsconfig.json`, `package.json`, path aliases, package exports, and project references.
- TypeScript compiler module resolution for React/TypeScript imports, including aliases, barrels, workspace package exports, default barrel re-exports, package-subpath imports, and namespace JSX component usage.
- Compiler-AST declaration extraction for interfaces, object type aliases, scalar type aliases, enums, enum members, and member summaries.
- Type-only import separation with `TYPE_IMPORTS_MODULE` relationships and `typescript-type-import` references.
- JSX `PASSES_PROP` edges to declared prop member nodes when the rendered component has a known props type.
- First-pass intersection props and parallel React relationship evidence preservation.

Packaged `0.2.3` now extends the semantic path with:

- A behavior-preserving `reactAnalyzer.ts` split has brought the file below the immediate guardrail: shared analyzer types, source-text scanning and ID helpers, type-text helpers, import/re-export name helpers, route/store/context conventions, compiler-AST TypeScript declaration/type-parameter discovery, JSX composition/prop evidence, generic prop substitution/type-alias evidence helpers, prop utility/index-signature expansion, and TypeScript prop/interface/enum member discovery now live in focused modules. `reactAnalyzer.ts` is roughly 1,229 lines / 49.1 KB after the split.
- Type-parameter nodes, discriminated-union variants, literal union values, exported API/client contract patterns, local `REFERENCES_TYPE`, and `USES_TYPE_ARGUMENT` edges.
- Imported function, hook, and store call resolution through import bindings, including namespace-style calls.
- Import-resolved evidence markers for React call and hook relationships.
- Default/named import and re-export aliases through React barrels.
- Imported prop type aliases, inherited props with `EXTENDS_PROPS`, `ComponentProps<typeof Component>` aliases, and JSX prop resolution through inherited or shared prop declarations.
- Utility-prop expansion for `Pick`, `Omit`, `Partial`, `Required`, `Readonly`, finite-key `Record`, broad `Record<string, T>`, finite template-literal keys, TypeScript index signatures, and simple mapped types.
- Generic function component parsing with type-parameter nodes, typed props ownership, and JSX type-argument edges.
- First-pass JSX type-argument substitution in generic prop-flow evidence for explicit generic component usages, defaulted generic substitutions when JSX omits explicit type arguments, value-derived generic substitutions from literal/literal-array JSX props, simple props-alias parameter remapping when component props bind alias type parameters, and local/imported nested generic type-alias expansion in prop-flow evidence.
- Inferred prop nodes for untyped destructured component parameters in TypeScript and JavaScript/JSX components, including first-pass nested destructuring, rest prop, and simple default-value type/optionality hints.

## Documentation Alignment

Docs should use this wording split:

- Public scope: first-pass React/TypeScript support with compiler-backed project discovery, import resolution, declaration/member extraction, and selected prop/call/type edges.
- Known limits: full type-checker-backed inference, complex mapped/indexed types, broad generic expansion, external package type surfaces, generated declaration coverage, and deeper framework conventions remain in progress.
- Next steps: prioritize real-project validation and fixture-backed misses before expanding into broader React framework features.

## Recommended Next Steps

1. Turn the direction reset at the top of `NEXT_STEPS.md` into an implementation checklist for the durable agent-readable map contract: source facts, inferred relationships, pattern instances, evidence/confidence, examples to imitate, and caveats.
2. Audit current analyzer backlog and keep only slices that improve a named pattern or agent-facing query. Move broad projection/LINQ/helper-method expansion out of the immediate lane unless backed by a miss fixture.
3. Build the miss-driven fixture loop around map quality: each wrong `where-to-add`, noisy `flow`, or missing pattern should get a small good/okay/bad fixture.
4. Continue the data-backed pattern plan only where it improves source-of-truth answers: type-code-to-template/option alignment, runtime/supporting role labels, broader source-of-truth intent classification, and fixture coverage.
5. Validate React/Next query quality on a larger real project or convert alpha misses into fixtures; prefer compiler/LSP/TypeScript facts over regex-only semantic expansion.
6. Extend provenance beyond relationships: relationship source kinds are now visible in agent output and filterable in SQLite/CLI; pattern summaries and context packs should carry the same source-kind/confidence language next.
7. Continue the `queryService.ts` split only if file size or agent maintainability regresses. Project metadata and symbol lookup now live in `queryBasic.ts`; code-health queries now live in `queryCodeHealth.ts`; references/relationships now live in `queryRelationships.ts`; pattern, pattern-map, and hotspots now live in `queryPatterns.ts`; search/exact-file query handling now lives in `querySearch.ts`; flow context expansion now lives in `queryFlowContext.ts`; endpoint-location enrichment now lives in `queryNodeLocations.ts`; where-to-add orchestration and enrichment now live in `queryWhereToAdd.ts`.

## Validation

Latest full validation on 2026-07-08:

- `npm test` passed with 94/94 tests after the first Dapper result projection, C# model projection, relationship source-kind labeling, and SQLite source-kind filtering slices.
- `node dist/cli.js rebuild --workspace ..\test-projects --format agent` completed with 743 files, 6832 symbols, 1725 references, 8017 relationships, 23 patterns, and 12 findings.
- Real Kelp checks for the tropical-beverage `where-to-add`, exact `table:public.persona_detail_templates` relationships including `MAPS_DAPPER_RESULT`, `PROJECTS_DAPPER_ROW`, and `PROJECTS_MODEL`, exact `PersonaTemplateRow` projection/property relationships, exact `PersonaInfoFieldDataModel --edge PROJECTS_MODEL` relationships, exact `type-code:7101` relationships, `template-backed runtime field`, `Dapper type binding`, and `model projection` pattern output.
