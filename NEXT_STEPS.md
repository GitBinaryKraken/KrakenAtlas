# Kraken Atlas Next Steps

Kraken Atlas is moving from "query before reading" toward "agent-readable code mapping."

## Direction: Better Code Maps For Agents

Atlas should not compete with Roslyn, LSP servers, SourceGraph, NDepend, TypeScript's compiler, or other mature semantic engines. Those tools are upstream fact sources. Atlas should use the strongest available source facts, normalize them into a local map, and add the missing agent-oriented layer: patterns, likely edit surfaces, nearby examples, blast-radius hints, and compact evidence.

Product center:

- Build an AI-readable atlas of the codebase, not a human-first graph browser.
- Prefer compiler/LSP/Roslyn/TypeScript facts over reimplementing semantics with ad hoc parsing.
- Add value by connecting code facts into local architecture patterns and task-focused recommendations.
- Keep outputs queryable and compact: `where-to-add`, `flow`, `relationships`, `pattern`, `pattern-map`, `plan-change`, context packs, SQLite/JSONL records, and future map exports.
- Measure success by agent decisions: did Atlas point to the right source-of-truth files, nearest implementation to imitate, supporting evidence, and likely blast radius before broad source reads?

Immediate map-first priorities:

1. Define the durable agent-readable map contract.
   - Solution/project/package boundaries.
   - Namespace/module/type/member hierarchy.
   - Calls, references, implementations, inheritance, imports/exports, routes, config, data access, UI bindings, and model projections.
   - Pattern instances with role labels, evidence, confidence, examples to copy, and caveats.
   - Done: relationship evidence now carries source-kind labels for `compiler-resolved`, `source-parsed`, `convention-derived`, `inferred`, and `text-derived` facts in query evidence and compact agent output.
   - Done: relationship facts now persist `source_kind` in SQLite, enrich stored relationship JSON with `sourceKind`, bump the map schema to `0.1.1`, and support `query relationships --source-kind <kind>` filtering with an old-map compatibility fallback.
   - Next: apply the same source-kind/provenance contract to pattern summaries and context packs.

2. Treat analyzers as source-fact adapters.
   - Roslyn should remain the C# semantic foundation.
   - TypeScript compiler/LSP-style resolution should remain the React/TypeScript semantic foundation.
   - SQL/Dapper, Razor, JavaScript, config, and generated-file scanners should add codebase-specific facts not already available from the compiler.
   - Future integration ideas should be evaluated as map inputs, not as products to clone.

3. Build pattern recognition on top of the map.
   - Pattern families should answer agent questions such as: controller-service-repository, CQRS/MediatR handler, validator/pipeline, options/config, template-backed configuration, shared DTO lifecycle, route/page/component/API flow, state-store usage, and model projection.
   - Pattern output should say what to edit first, what to inspect only as supporting evidence, and which existing implementation to imitate.

4. Use misses as the quality loop.
   - Every wrong `where-to-add`, noisy `flow`, or missing pattern should become a compact fixture with good/okay/bad expected answers.
   - Prefer small map-quality slices over broad graph expansion.
   - Do not add a new edge family unless it improves an agent-facing answer or unlocks a clearly named pattern.

5. Keep visualization secondary.
   - A graph UI or static report can be useful later, but the main product is the map and the agent-readable answers derived from it.
   - Markdown/Obsidian export should start query-scoped and source-backed, not as a whole-repo generated wiki.

## Current Map-Quality Track: Data-Backed Feature Pattern Recognition

Atlas should learn the class of problem exposed by the Kelp "favorite tropical beverage" test: a requested user-facing field may be created through admin/config/template data, while the obvious runtime UI files only render or persist already-configured fields.

Target answer shape:

- Start here: admin/config/source-of-truth surfaces that create the field, option, type, template, or taxonomy entry.
- Supporting evidence: generated table models, type-code enums, seed/migration rows, and data services that read/write the backing records.
- Runtime evidence: renderers, editors, API endpoints, and persistence services that prove how configured values flow at runtime.
- Avoid initially: generic runtime renderers or Identity/account pages that match words like `profile`, `user`, or `field` but are not the source of truth.

Implementation slices:

1. Done: add database object nodes and SQL edges.
   - Emits table nodes such as `table:public.persona_detail_templates` and `table:public.objecttypes`.
   - Extracts `READS_TABLE`, `WRITES_TABLE`, `UPSERTS_TABLE`, `DELETES_FROM_TABLE`, and `JOINS_TABLE` relationships from Dapper/Npgsql/raw SQL strings.
   - Scans SQL in services, admin tools, seed/migration-style `.sql` files, generated data-access code, Razor, JavaScript/TypeScript, and JSON files.
   - Keeps first-pass parsing conservative around exact `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `ON CONFLICT`, and `MERGE` evidence.

2. In progress: connect generated table models, seeds, and type-code contracts to database nodes.
   - Done: maps generated classes such as `PersonaDetailTemplatesTableDataModel` to `public.persona_detail_templates` with `BACKS_TABLE` relationships.
   - Done: explicit seed/migration-style SQL writes now create table edges because `.sql` files are indexed as source files.
   - Done: first-pass `TypeCode` enums/classes/properties are surfaced with `type-code-contract`, and SQL writers touching `type_code`/`typecode` receive `type-code-editor`.
   - Done: C# type-code enums with explicit numeric values now emit enum-member symbols, shared `type-code:<value>` nodes, `HAS_TYPE_CODE_MEMBER`, and `DEFINES_TYPE_CODE` relationships.
   - Done: conservative row-level SQL seed facts now emit `row:<table>:<identifier>` nodes plus `INSERTS_ROW`, `ROW_IN_TABLE`, and `ROW_HAS_TYPE_CODE` edges when an `INSERT` has explicit columns and simple literal values.
   - Next: align specific type-code members to table-driven template/option records beyond explicit seed rows when names or numeric values are precise enough.

3. In progress: connect Dapper SQL to the C# types flowing through it.
   - Done: maps Dapper generic result calls such as `QueryAsync<T>` and `QueryFirstOrDefault<T>` from touched table nodes to resolved C# result DTO/table-model/domain symbols with `MAPS_DAPPER_RESULT`.
   - Done: maps typed `ExecuteAsync`/write parameters to request/command/domain DTO symbols with `USES_DAPPER_PARAMETER` when the argument is a named method parameter, local variable, or explicit `new T`.
   - Done: exposes Dapper table-to-type edges in relationship queries, flow context, scoring, SQLite roles, and a `Dapper type binding` pattern without overwhelming direct table operations.
   - Done: exact symbol/table relationship queries now lead with direct graph edges before value-lifecycle expansion, and `JOIN LATERAL` is ignored as a table name.
   - Done: connects typed Dapper result variables to domain/data models through direct object-initializer projections with `PROJECTS_DAPPER_ROW` and `MAPS_DAPPER_PROPERTY`.
   - Done: resolves private nested row properties even when Roslyn omits the containing service segment from child property IDs.
   - Done: synthesizes type-level C# model projection edges from resolved `MAPS_PROPERTY` clusters with `PROJECTS_MODEL`, so table-backed chains can continue from Dapper/domain models into API/view model contracts.
   - Done: exact table relationship queries can now carry the chain from `MAPS_DAPPER_RESULT` through `PROJECTS_DAPPER_ROW` into downstream `PROJECTS_MODEL` evidence.
   - Next: use the existing Dapper/domain/API bridge to improve pattern roles, examples-to-copy, and supporting-evidence labels in agent-facing answers.
   - Deferred unless fixture-backed: broaden projection mapping to LINQ/grouped projections, constructor arguments, helper mapping methods, and return-flow chains without over-linking incidental expressions or flooding property-level output.
   - Later: infer SQL column-to-property mappings only when aliases, constructor parameters, or simple object initializers make the mapping precise.

4. Done: detect first-pass admin/config source-of-truth roles.
   - Adds roles/tags such as `admin-config-surface`, `definition-source`, `taxonomy-manager`, `object-type-manager`, `template-admin-surface`, `template-reader`, `runtime-template-reader`, `generated-table-model`, and `template-table-model`.
   - Uses signals from paths (`AdminTools`, `PageAdmin`), SQL writes to taxonomy/template tables, generated table model naming, and template table reads.
   - Treats broadly named pages like `AdminTools/Pages/Index.cshtml` as meaningful when their relationships prove they manage object types/categories/templates.

5. Done: add a first-pass `template-backed-runtime-field` pattern detector.
   - Detects the multi-hop shape where admin/config code writes taxonomy/template tables and runtime services read template tables.
   - Classifies pattern instances as `definition-source` and `runtime-template-reader`; finer `runtime-renderer`, `value-persistence`, `display-consumer`, and `admin-editor` labels remain next.
   - Uses table relationships rather than Kelp-only filenames, and `query pattern` now opens the pattern instance files directly.

6. In progress: upgrade `where-to-add` to use source-of-truth buckets.
   - Done: configurable profile/persona detail prompts rank AdminTools object/type/template surfaces above runtime PersonaInfo and Identity/account distractors, even when scoped from WebUI.
   - Done: source-of-truth roles boost admin/config recommendations, table relationships count as connected feature evidence, and cross-project follow-up commands use the recommended file's context.
   - Done: exact table relationship queries prioritize table edges over incidental JSON/property text matches.
   - Done: template-backed profile/detail prompts explicitly include and prioritize the `template-backed-runtime-field` pattern fit over generic UI patterns.
   - Done: Dapper table-to-type edges count as supporting connected evidence for table-backed field changes.
   - Next: broaden intent classification beyond profile/persona details into hardcoded fields, shared DTO fields, taxonomy options, validation rules, endpoint changes, and renderer behavior.
   - Next: keep runtime files visible with explicit "supporting evidence; edit only if behavior changes" labels.

7. Build a miss-driven fixture library.
   - For each real miss, create a small synthetic good/okay/bad ranking test.
   - Include at least one fixture where the correct answer is a generic admin page, the okay answer is a runtime renderer, and the bad answers are Identity/account pages.
   - Add fixture variants for seed-only configuration, migration-backed configuration, generated table models, and enum/type-code-backed options.

Completion criteria:

- Done: a natural prompt like "let a user pick their favorite X on their profile" can discover whether the feature area is template-backed before recommending files.
- Done: `where-to-add` can explain why the admin/config file is first with role evidence such as `admin-config-surface` and `definition-source`.
- Done: follow-up commands for cross-project recommendations use the recommended file's project context.
- In progress: the behavior is fixture-backed and not hardcoded to Kelp-only names. The SQL/table analyzer regression now covers generic table nodes, generated table models, source-of-truth roles, Dapper result/parameter type binding, Dapper result projection mapping, C# model projection chaining, pattern detection, relationship ordering, and the tropical-beverage ranking; add more miss variants next.

Validation snapshot:

- `npm test` passes on 2026-07-08 with 94/94 tests after the first Dapper result projection, C# model projection, relationship source-kind labeling, and SQLite source-kind filtering slices.
- `node dist/cli.js rebuild --workspace ..\test-projects --format agent` completes with the C# type-code, SQL/table, SQL seed-row, Dapper type-binding, Dapper projection, and C# model projection analyzers enabled: 743 files, 6832 symbols, 1725 references, 8017 relationships, 23 patterns, 12 findings.
- The real Kelp query `where-to-add "let a user, on their profile page, pick their favorite tropical beverage" --context Kelp2025_WebUI` opens AdminTools object/type management first and keeps AdminTools follow-up context.
- The exact table query `relationships "table:public.persona_detail_templates"` now opens `PersonaDataService.cs` and `PersonaDetailTemplatesTableDataModel.cs`, not unrelated property-mapping noise.
- The exact table query now also includes `MAPS_DAPPER_RESULT: table:public.persona_detail_templates -> PersonaDataService.PersonaTemplateRow`, `PROJECTS_DAPPER_ROW: PersonaTemplateRow -> PersonaInfoFieldDataModel`, and `PROJECTS_MODEL: PersonaInfoFieldDataModel -> PersonaDetailFieldViewModel` in JSON output, while `relationships "table:lateral"` returns no fake table matches.
- The exact row query `relationships "PersonaTemplateRow" --edge PROJECTS_DAPPER_ROW` shows the Kelp row-to-field-model bridge, and `--edge MAPS_DAPPER_PROPERTY` shows `TypeCode`, `Title`, `Description`, and `DatasourceSid` property flow.
- The exact domain query `relationships "PersonaInfoFieldDataModel" --edge PROJECTS_MODEL` opens `KelpApiLogicLayer/Extentions/PersonaMappingExtensions.cs` and shows the domain-to-API/view-model bridge.
- The exact type-code query `relationships "type-code:7101"` opens `PersonaDetailTypeCode.cs` and shows `PersonaDetailTypeCode.Birthday = 7101`.
- Relationship queries can now be narrowed by map fact provenance, for example `--source-kind compiler-resolved` for stronger semantic facts or `--source-kind inferred` for synthesized bridge edges such as model projections.

The SYNAPSE comparison is useful signal: developers and agents both want architecture mapping. Atlas should lean into that demand while staying distinct. The goal is not to become a pretty graph viewer first. The goal is to make a repo's existing patterns actionable before an edit happens.

## Side Research: Graphify Plus Obsidian

Source: https://www.youtube.com/watch?v=mWLDn49_8HA

Captured 2026-07-03 from English auto-generated captions. The useful lesson is that a graph can become more agent-useful when it can be projected into a durable markdown knowledge surface with backlinks and source anchors. For Atlas, that should be a later export path, not a replacement for query-first workflows.

Candidate Atlas-sized features:

- Add optional Markdown/Obsidian export from a narrowed query result or context pack before considering whole-workspace vault generation.
- Export source-backed notes rather than bare node stubs: node ID, project, role, tags, source locations, strongest relationships, detected patterns, member/usage summaries, and copyable follow-up commands.
- Support safe export modes such as standalone vault, quarantined subfolder, and curated subset folder.
- Reuse SQLite enrichment tables, node tags, roles, members, usage summaries, and pattern-map categories as the export source.
- Add optional links from code nodes to checked-in repo docs, READMEs, ADRs, and design notes when those source documents exist.

Roadmap fit:

- Do not interrupt the `0.2.x` React/TypeScript semantic hardening.
- Treat this as a post-0.2.x context-pack/export enhancement.
- Start with query-scoped export so the feature continues to reduce context instead of creating a large generated wiki.

## Product Thesis

Atlas wins when it can answer:

- What pattern does this repo already use?
- Where is the closest example?
- Which files should an agent edit first?
- What would violate the local architecture?
- What context can be safely ignored?

Code mapping is the center of gravity. Symbol/index facts from Roslyn, TypeScript, LSP-style tools, SQL scanners, and framework analyzers are the substrate; pattern mapping is the interpretation layer that makes those facts useful to agents. Atlas should keep strengthening both pieces only when they improve task-focused answers.

## Near-Term Priorities

### Agent-Maintainability Slice: Query Service Refactor

Keep query behavior stable while splitting `queryService.ts` into smaller, intent-focused modules that agents can read without loading the whole query engine.

Progress:

- Done: extracted public query types into `queryTypes.ts`.
- Done: extracted project/context inference and ambiguity helpers into `queryContext.ts`.
- Done: extracted primitive query utilities into `queryUtils.ts`.
- Done: extracted compact response, evidence, reference, relationship, and pattern evidence builders into `queryEvidence.ts`.
- Done: extracted shared query text/intent helpers into `queryText.ts`.
- Done: extracted path and scoring helpers into `queryPath.ts` and `queryScoring.ts`.
- Done: extracted `where-to-add` ranking, caveats, pattern-fit evidence, confidence scoring, and file recommendation types into `whereToAddRanking.ts`.
- Done: extracted `where-to-add` response orchestration, usage/node-tag enrichment, shared-contract boundary loading, and context pruning into `queryWhereToAdd.ts`.
- Done: extracted flow edge ranking, composition, JavaScript interaction promotion, flow coverage scoring, flow caveats, and shared graph predicates into `queryFlow.ts`.
- Done: extracted flow context expansion for layered, configuration, data, property, requested-property, and project-reference edges into `queryFlowContext.ts`.
- Done: extracted relationship endpoint-location enrichment into `queryNodeLocations.ts`.
- Done: extracted search row ranking, weak-match detection, search/exact-file query response composition, relationship-term scoring, pattern scoring, and reference fallback guidance into `querySearch.ts` and `queryReferences.ts`.
- Done: extracted hotspot and architecture-risk summary construction, role scoring, usage-summary shaping, and guidance text into `queryHotspots.ts`.
- Done: extracted `plan-change` response composition, shared-contract checklist assembly, avoid-hotspot shaping, and context-pack command generation into `queryPlanning.ts`, reducing `queryService.ts` to query orchestration for that command.
- Done: extracted value-lifecycle relationship lookup, C# symbol/member anchor discovery, and identifier term helpers into `queryValueLifecycle.ts`, keeping Razor/model-binding/C# property bridge behavior stable.
- Done: extracted references and relationships query response composition, reference coverage fallback, relationship filters, value-lifecycle integration, and datatype/member/role/tag summaries into `queryRelationships.ts`.
- Done: extracted pattern, pattern-map, and architecture-hotspot query response composition plus hotspot row readers into `queryPatterns.ts`.

Next work:

- Continue `0.2.x` React/JSX/TypeScript semantic hardening beyond the first-pass fixture support.
- High-priority React fix queue:
  1. Done: connect `React.FC<Props>`, `FC<Props>`, and `FunctionComponent<Props>` typed components to prop/member nodes.
  2. Done: resolve React barrel re-exports such as `export { Component } from "./Component"` and `export * from "./Component"` for component composition/import edges.
  3. Done: add first-pass nested object member hints for common props like Next.js `params.workflowId`.
  4. Done: mark Next.js client/server component conventions from `"use client"` and server action files as lightweight roles/tags.
  5. Done: map Next.js `app/api/**/route.ts` handlers to API route nodes.
  6. Next: validate React/Next query quality on a larger real project or add misses from alpha feedback.
- Current React hardening queue:
  1. Done: extract React/TypeScript props and interface members as queryable member nodes.
  2. Done: add component-to-props member relationships so agents can ask which component owns a prop.
  3. Done: add broader export forms, including default exports and wrapper calls such as `memo` and `forwardRef`.
  4. Done: add route support for more common route declaration styles.
  5. Done: add state-store detection for common hook/store modules.
  6. Done: add a second React fixture after the first baseline stays stable.
  7. Done: add React-specific feedback prompts for analyzer misses.
  8. Done: harden object-shaped TypeScript `type FooProps = { ... }` aliases for React props/member extraction.
  9. Done: add Next.js-style file-route detection for `app/**/page.tsx` and `pages/**/*.tsx`.
  10. Done: connect `React.FC<Props>`, `FC<Props>`, and `FunctionComponent<Props>` component annotations to props/member relationships.
  11. Done: resolve barrel re-export files for cleaner import edges from page/component files to implementation files.
  12. Done: add nested object member hints, Next client/server roles, and Next API route handler mapping.
  13. Next: harden additional TypeScript/React syntax discovered in real projects.
- Keep each slice behavior-preserving and run the full test suite after every analyzer expansion.

### 0.2.x Toward Complete TypeScript Semantic Analysis

Move the React/TypeScript mapper from convention-based parsing toward compiler-backed semantic analysis while preserving the lightweight, query-first Atlas output model.

Current status: `0.2.3` packages the semantic foundation plus the next React/TypeScript hardening wave: TypeScript project discovery, compiler-backed import resolution, compiler-AST declaration/member nodes, type-only imports, package export facts, namespace/default barrel resolution, JSX prop edges to declared/inferred members, generic/type relationships, imported function/hook/store call resolution, imported prop aliases, inherited and utility props, destructured props including nested/rest/default hints, and mixed JavaScript/TypeScript fixture coverage.

Keep the next slices fixture-backed. The remaining gap is not "React exists" anymore; it is how accurately Atlas follows TypeScript semantics without flooding query output.

High-priority semantic slices:

1. Done: build a TypeScript project discovery layer that finds `tsconfig.json`, workspace package roots, path aliases, JSX settings, and project references as queryable map facts.
2. Done: resolve React/TypeScript imports through TypeScript's compiler module resolver using discovered `tsconfig` settings, including alias imports to barrel files and implementation files.
3. In progress: add a broader TypeScript compiler-backed analyzer path for `.ts`, `.tsx`, `.js`, and `.jsx` symbols/types, keeping the current parser as a fallback for incomplete or dependency-light workspaces. First compiler-AST declaration pass now emits queryable interfaces, object type aliases, scalar type aliases, enums, enum members, and member summaries.
4. In progress: expand import/export graphs through TypeScript module resolution, including package `exports`, default exports, namespace imports, and type-only imports. Type-only imports now emit distinct `TYPE_IMPORTS_MODULE` relationships and `typescript-type-import` references, namespace JSX member usage resolves through barrel re-exports, `package.json` export surfaces are queryable package-export nodes, package-subpath imports can resolve through workspace package exports, default imports can follow default barrel re-exports, JSX default import aliases can resolve back to the actual component, and named import/re-export aliases are covered for React barrel files. Deeper external package resolution and more default export alias semantics remain.
5. In progress: use TypeScript semantics to connect JSX props to declared prop types, inferred props, generic components, union/intersection props, `ComponentProps<>`, and imported type aliases. JSX props now resolve to known declared prop member nodes, intersection aliases with inline object members are mapped, first-pass `ComponentProps<typeof Component>` aliases can point back to their source component, imported prop type aliases can resolve to shared prop declarations, inherited props now emit `EXTENDS_PROPS` plus inherited `PASSES_PROP` edges, first-pass utility props for `Pick`, `Omit`, `Partial`, `Required`, `Readonly`, finite-key `Record`, broad `Record<string, T>`, finite template-literal keys, TypeScript index signatures, and simple mapped types can resolve to prop members, generic function components can emit type-parameter nodes, JSX type-argument edges, concrete type-argument substitutions in JSX prop-flow evidence, defaulted generic substitutions when JSX omits explicit type arguments, value-derived JSX generic substitutions for literal and literal-array props, first-pass generic props-alias parameter remapping, and local/imported nested generic type-alias expansion in prop-flow evidence, and untyped destructured component parameters now emit inferred prop nodes for top-level, nested, rest, and simple default-value cases; full type-checker-backed inference, complex mapped types, and checker-backed generic constraints remain.
6. In progress: emit semantic nodes for interfaces, type aliases, enum/object literal contracts, generic type parameters, discriminated unions, and exported API/client types. Interfaces, object type aliases, scalar type aliases, literal union values, enums, enum members, member summaries, generic type parameters, first-pass discriminated-union variants, exported API/client contract patterns, local `REFERENCES_TYPE` edges, and generic argument edges are covered; deeper checker-backed generic expansion remains.
7. In progress: map call graphs from resolved symbols rather than name-only matches, including hooks, service helpers, API clients, route handlers, and state-store actions. Imported function calls, namespace imported calls, and imported hook/store calls now prefer compiler/import-resolved declarations and emit resolved references; full checker-backed call graph resolution remains.
8. In progress: add semantic relationship confidence fields/evidence so query output can distinguish compiler-resolved edges from convention or text-derived edges. First-pass import-resolved evidence markers now appear on resolved React call and hook relationships.
9. In progress: add fixture variants for monorepos, pnpm/yarn workspaces, generated declaration files, and mixed JavaScript/TypeScript projects. Mixed `.jsx` plus TypeScript barrel coverage is now present in `ReactNextPortal`; workspace/package-manager and generated-declaration variants remain.

TypeScript/React coverage gaps to close:

- High priority: deepen utility-prop expansion beyond first-pass finite-key/broad `Record`, finite template-literal keys, and simple index-signature support, including key remapping, conditional mapped types, referenced template-literal aliases, numeric/symbol/template index fallback, and checker-backed optionality/value types.
- High priority: expand generic props beyond first-pass generic function components, JSX type-argument edges, explicit/defaulted/value-derived JSX substitution evidence, simple props-alias parameter remapping, and local/imported nested generic type aliases, including checker-backed constraints and richer value inference.
- High priority: deepen inferred component props beyond the current first-pass destructuring support, especially checker-backed inferred prop types, richer default-value refinement, nested arrays, alias/default pattern edge cases, and generic component inference.
- High priority: resolve higher-order component wrappers beyond `memo` and `forwardRef`, including local wrapper helpers and common provider/layout wrappers.
- Medium priority: deepen checker-backed call graph resolution for callbacks, imported object methods, hook-return methods, service clients, and async action functions.
- Medium priority: map external package type surfaces when package declarations are available, especially UI libraries and generated API clients.
- Medium priority: add generated declaration coverage for `.d.ts` files and generated client folders without flooding the map.
- Medium priority: add pnpm/yarn/npm workspace fixture coverage, including package `exports`, project references, path aliases, and mixed JS/TS package boundaries.
- Medium priority: improve relationship evidence labels so compiler-resolved, import-resolved, convention-derived, and text-derived edges are easy to filter in SQLite and agent output.
- Lower priority: add React Server Components/Suspense/loading/error boundary conventions only after core prop/type/call semantics are stronger.

.NET/C# coverage gaps to close:

- High priority: add more fixture coverage for Minimal API route groups, endpoint filters, typed results, and route-handler lambdas so ASP.NET Core apps without controllers remain well mapped.
- High priority: improve EF Core relationship mapping beyond `DbSet` usage, including `Include`/`ThenInclude`, projections, tracked writes, transactions, and repository abstractions.
- Medium priority: map MediatR/CQRS command/query handlers, validators, pipeline behaviors, and notification handlers as first-class pattern edges.
- Medium priority: improve background-service and hosted-worker coverage, including queues, scheduled jobs, and message consumers.
- Medium priority: map options/configuration flow from `appsettings*.json` through `IOptions<T>`, named options, validation, and consuming services.
- Medium priority: improve cross-project DTO lifecycle tracking for request/response models, especially AutoMapper profiles, manual mapping helpers, and generated clients.
- Lower priority: add Blazor/component-specific coverage after ASP.NET Core/Razor and React/TypeScript work are stable.

Public alpha wording:

- Keep React/TypeScript described as first-pass until full type-checker-backed prop inference, generic expansion, call resolution, external package surfaces, and real-project framework validation are stronger.
- Do mention the compiler-backed slices that are already present: TypeScript project discovery, import resolution, declaration/member extraction, and selected prop/call/type edges.
- Avoid naming private regression projects in release notes, docs, generated agent instructions, and packaged audit output.

Why now:

- Future agent work on Atlas often starts in query behavior, and one very large service increases context load.
- Smaller modules make it safer to keep adding role-aware ranking, context-pruning, and React/TypeScript support later.
- This is an enabling refactor, not a feature detour: the immediate feature target is agent-readable planning with less context load.

### Agent-Maintainability Slice: File-Size Guardrails

Audit from 2026-07-06:

- `src/analyzers/reactAnalyzer.ts`: 2,645 lines / 108.1 KB at audit time. It was the largest production file and carried TypeScript declaration discovery, import/re-export resolution, React declaration discovery, prop/member extraction, utility/generic prop expansion, JSX composition, type/reference edge emission, route/store/context detection, and semantic evidence formatting. Current post-`0.2.3` development has reduced it below the immediate guardrail to roughly 1,229 lines / 49.1 KB.
- `src/query/queryService.ts`: currently roughly 899 lines / 37.2 KB. The earlier helper extractions helped, and post-`0.2.3` development has now extracted project metadata, symbol lookup, code-health, references, relationships, pattern, pattern-map, hotspots, search, exact-file, flow-context, endpoint-location, and where-to-add helpers into focused modules. The service is below the near-term 1,200-line target and close to the long-term 800-line target.
- `src/storage/sqliteIndex.ts`: currently roughly 1,187 lines / 38.2 KB. Monitor for now; it is below the immediate split threshold but should not absorb more unrelated enrichment behavior.
- Test hotspots: `test/queryService.test.ts` has been split into core, where-to-add/context-pruning, and search/reference/relationship/flow suites under the guardrail. `test/webAnalyzer.test.ts` has been split into Razor/HTML, JavaScript-flow, React prop/type, and React route/workflow suites; no test file is currently above the 1,200-line guardrail.

Refactor queue:

1. Done: split `reactAnalyzer.ts` into behavior-preserving modules before adding more broad React/TypeScript semantics. Extracted shared analyzer types, source-text scanning and ID helpers, type-text helpers, import/re-export name helpers, route/store/context conventions, compiler-AST TypeScript declaration/type-parameter discovery, JSX composition/prop evidence, generic prop substitution/type-alias evidence helpers, prop utility/index-signature expansion, and TypeScript prop/interface/enum member discovery into focused modules, reducing `reactAnalyzer.ts` below the immediate guardrail to roughly 1,229 lines / 49.1 KB. Monitor it and extract call/type-reference emission only if it grows again.
2. In progress: continue the `queryService.ts` split by extracting remaining command branches into intent handlers. Project metadata and symbol lookup now live in `queryBasic.ts`, code-health queries now live in `queryCodeHealth.ts`, references/relationships now live in `queryRelationships.ts`, pattern/pattern-map/hotspots now live in `queryPatterns.ts`, search/exact-file query handling now lives in `querySearch.ts`, flow-context helpers now live in `queryFlowContext.ts`, endpoint-location enrichment now lives in `queryNodeLocations.ts`, and where-to-add orchestration now lives in `queryWhereToAdd.ts`. The service is below the near-term 1,200-line target and close to the long-term 800-line target; pause further service extraction unless it grows again.
3. Done: split `test/webAnalyzer.test.ts` into Razor/HTML, JavaScript-flow, React prop/type, and React route/workflow suites once the analyzer modules were extracted.
4. Done: split `test/queryService.test.ts` by query intent after the remaining `queryService.ts` handlers moved out. The resulting files are `queryService.test.ts`, `queryService.whereToAdd.test.ts`, and `queryService.discovery.test.ts`, with shared helper construction in `test-support/queryTestHelpers.ts`.
5. Ongoing: treat any production file above roughly 1,500 lines or any test file above roughly 1,200 lines as a next-step refactor candidate unless it is deliberately generated or table-driven.

### 0. SQLite Node Enrichment

Keep JSONL nodes lightweight, but add rebuild-time SQLite enrichment tables keyed by node ID.

Progress:

- Done: `node_projects` reports declaration, reference, and relationship-evidence projects for shared datatypes.
- Done: `node_roles` distinguishes domain contracts, request/response DTOs, entities, options, controllers, services, repositories, views, forms, scripts, and JavaScript controllers.
- Done: `node_members` surfaces compact property/field evidence for C# datatype queries without opening whole model files.
- Done: `node_usage_summary` precomputes relationship, reference, project, hotspot, edit-likelihood, and avoid-initially signals for nodes.
- Done: `node_tags` infers stable feature nouns from paths, namespaces, symbols, references, and relationship evidence, then surfaces them in relationship summaries and feature recommendations.
- Done: `where-to-add`, `plan-change`, and context packs now carry matched node tags so agents can see why a file belongs to a requested feature area.
- Done: shared-contract boundary warnings combine `node_projects`, `node_roles`, and `node_members` so field changes to shared request DTOs call out domain/API/WebUI impact.
- Done: `plan-change` turns shared-contract boundary evidence into a compact cross-project checklist covering contract shape, producer mappings, API consumers, validation/binding, client serialization, and tests.
- Done: context pack relationship evidence is pruned with selected files, matched tags, and project boundaries so multi-project packs stay focused on the requested feature.
- Done: `where-to-add` recommendations include compact role, project, symbol-role, and member hints from enrichment tables.
- Done: recommendation role/project/member enrichment moved out of `queryService.ts` into `queryRecommendationGuidance.ts`, reducing the service to orchestration for that slice.
- Done: private multi-project `test-projects` fixture rebuilds the multi-project corpus and verifies shared-contract context focus for shared-domain/WebUI page-draft changes.
- Done: context pruning now treats compound feature tags conservatively so generic namespace/path tags such as `pages` do not keep unrelated relationship noise in focused context packs.
- Done: `plan-change` carries forward `where-to-add` pruning evidence when the second planning pass receives already-pruned relationships.
- Done: `where-to-add` now recognizes template-backed profile/persona detail requests, expands natural "favorite/pick field on profile" prompts toward AdminTools object/type management plus PersonaDetailTemplate/TypeCode backing evidence, demotes runtime PersonaInfo and Identity distractors, and emits follow-up commands in the recommended file's own context.

Next work:

- Continue React/JSX/TypeScript analyzer hardening now that the first fixture and language detection are in place.

Why now:

- Multi-project workspaces often share domain datatypes across WebUI, API, connector, and logic projects, and those shared datatypes are contract boundaries.
- Upfront indexing cost is acceptable if it reduces agent context and makes query output more stable.
- This strengthens the existing agent workflow without turning Atlas into a visual graph product.

### 1. Pattern Map v1 Polish

Make `query pattern-map` the standard first move before `where-to-add`.

Next work:

- Add `pattern-map` examples to `AGENT_SKILL.md`.
- Add a short pattern-first workflow to `GETTING_STARTED.md`.
- Make category labels sharper and more consistent.
- Improve context scoping so maps can be filtered by project, feature area, or folder.
- Add fixtures for common architecture shapes:
  - controller to service to repository
  - Razor page to handler to service
  - API route to DTO to validator to service
  - config binding to options usage
  - frontend event to backend endpoint

### 2. Pattern Fit in `where-to-add`

`where-to-add` should not only return likely files. It should explain the local pattern an edit should follow.

Target output:

- Likely pattern
- Existing examples
- Add or change points
- Files to avoid
- Caveats
- Suggested next query

This makes Atlas more useful for coding agents because it converts architecture discovery into edit planning.

### 3. Pattern Drift Detection

Add early drift candidates that identify when code appears to break an established repo pattern.

First drift checks:

- Controller bypasses the service layer where service usage is the norm.
- Service writes directly to `DbContext` where repository usage is the norm.
- Form post or endpoint exists without nearby validation.
- Config key is used but not bound through the local options pattern.
- Frontend fetch or form action points at a backend route Atlas cannot resolve.
- New file sits outside the folder pattern used by similar features.

The tone should stay careful: these are candidates, not accusations.

### 4. Alpha Feedback Loop

Turn feedback into regression fixtures quickly.

Add pattern-specific prompts to `ALPHA_FEEDBACK.md`:

- Did Atlas identify the pattern you would copy?
- Did it miss the canonical example?
- Did it recommend files that are technically related but architecturally wrong?
- Did it catch or miss a pattern violation?

Every good miss should become either a fixture, a scoring tweak, or a new relationship edge.

### 5. Demo Story

Build one end-to-end demo that shows why Atlas is different.

Suggested demo:

1. Ask Atlas for the pattern map.
2. Ask where to add a notification or preferences field.
3. Follow the returned flow across UI, route, service, persistence, validation, and config.
4. Generate a context pack for the exact edit.
5. Show the agent opening fewer files and following the local pattern.

The story should feel practical, not theoretical: "Here is how you add a real feature without wandering the repo."

### 5a. Optional Knowledge-Base Export

After context packs and React/TypeScript map slices are stable, consider a markdown export path for users who keep repo knowledge in Obsidian or another notes system.

First slice:

- Export a selected context pack or query result into a generated folder of source-backed markdown notes.
- Preserve Atlas node IDs, source file/range anchors, relationships, tags, roles, and follow-up query commands.
- Write backlinks between exported notes from existing Atlas relationships.
- Keep the generated folder quarantined and deletable by default.

Later slices:

- Export feature communities or pattern-map areas as higher-level notes.
- Link code nodes to checked-in repo documentation and ADRs.
- Add a manifest so generated notes can be updated without touching user-written notes.

### 6. React, JSX, and TypeScript Analyzer

First-pass React support is now in place after the core agent workflow, SQLite enrichment, and pattern-map work became durable enough to absorb the denser graph.

React is not treated as a standalone language. The scope is JavaScript/TypeScript files that use React conventions, JSX/TSX syntax, component composition, hooks, context providers, routes, and browser-to-backend calls.

This came after SQLite enrichment, role/member-aware `where-to-add`, and pattern-map polish were durable enough to absorb the denser React graph. React projects create many more symbols and edges than vanilla JavaScript, so every expansion should keep project, role, tag, usage, and context-shrinking output in view.

Initial scope:

- Done: Add `.ts`, `.tsx`, and `.jsx` language detection.
- Done: Parse first-pass React components, exported components, props, hooks, context providers, route files, event handlers, imports, and API/fetch calls.
- Done: Add graph relationships such as `RENDERS_COMPONENT`, `USES_HOOK`, `USES_STORE`, `PASSES_PROP`, `PROVIDES_CONTEXT`, `CONSUMES_CONTEXT`, `HANDLES_EVENT`, `IMPORTS_MODULE`, `MAPS_ROUTE`, and `CALLS_API_ROUTE`.
- Done: Add React-aware roles such as `react-component`, `hook`, `context-provider`, `route`, and `client-service`.
- Done: Add pattern-map categories for component composition, hook/context flow, and route/API flow.
- Done: Start with `test-projects/ReactAgentDashboard`, a small Vite React/TypeScript fixture that includes components, props, hooks, context, routes, JSX, API calls, and event handlers.
- Done: Add richer prop type/member extraction and component-to-props member relationships.
- Done: Add broader JavaScript/TypeScript export forms and route-object styles.
- Done: Add state-store detection and a state-store pattern-map category.
- Done: Add `test-projects/ReactWorkflowBoard` as a second route/state fixture.
- Done: Extract object-shaped TypeScript `type FooProps = { ... }` aliases as prop/member nodes.
- Done: Add `test-projects/ReactNextPortal` as a small Next-style fixture for app-router and pages-router file routes.
- Done: Connect `React.FC<Props>`, `FC<Props>`, and `FunctionComponent<Props>` annotations to props/member nodes.
- Done: Resolve React barrel re-exports so imports through `index.ts` still point at implementation files.
- Done: Add nested object member hints such as `params.workflowId` for route props.
- Done: Add lightweight Next client/server component and server-action roles from `"use client"` / `"use server"` conventions.
- Done: Map Next `app/api/**/route.ts` handlers to API route nodes.
- Next: continue semantic hardening from real misses, prioritizing inferred props, utility/generic props, workspace package boundaries, generated declarations, and clearer semantic evidence labels.

## Roadmap

### 0.1.30: SQLite Node Enrichment

- Add project, role, tag, member, and usage-summary enrichment tables to `index.sqlite`.
- Surface cross-project datatype usage in relationship and change-planning output.
- Use role/member tables to improve `where-to-add` ranking and context-pack slices.
- Add sanitized multi-project fixtures where shared-domain datatypes are used by WebUI, API, connector, and logic projects.

### 0.1.27: Pattern Map Polish

- Document pattern-first workflows.
- Add `pattern-map` to the agent skill playbook.
- Tighten agent output around observed architecture areas.
- Add regression coverage for core pattern categories.

### 0.1.28: Pattern-Fit `where-to-add`

- Attach pattern summaries to add-location results.
- Rank files by architectural role, not just symbol or relationship proximity.
- Include canonical examples when available.
- Add tests for edit guidance output.

### 0.1.29: Pattern Drift Candidates

- Add first drift record shape.
- Implement two or three high-confidence checks.
- Keep output scoped and cautious.
- Add alpha feedback fields for false positives and missed drift.

### 0.1.30: Demo Package and Scoring Loop

- Add a small demo fixture or guided walkthrough.
- Capture before and after agent workflow.
- Track whether top results include the files humans actually edit.
- Use feedback to tune ranking and category language.

### 0.2.0: React, JSX, and TypeScript Analyzer v1

- Done: Add `.jsx`, `.ts`, and `.tsx` language detection.
- Done: Index first-pass React components, hooks, props, context providers, route files, event handlers, imports, and API/fetch calls.
- Done: Emit React relationships for render trees, hook usage, prop flow, context use, event handling, imports, route mapping, and backend route calls.
- Done: Add React role/tag enrichment so agent queries can distinguish components, hooks, routes, client services, and context providers.
- Done: Use `test-projects/ReactAgentDashboard` as the first Vite React/TypeScript fixture before broad framework expansion.
- Done: Extract React/TypeScript prop and interface members as queryable node-member facts.
- Done: Harden analyzer coverage for named default exports, `memo(...)`, `forwardRef(...)`, and additional route-object styles.
- Done: Add state-store detection for common hook/store modules.
- Done: Add a second React fixture and harden object-shaped TypeScript return types in service functions.
- Done: Add object-shaped TypeScript props alias extraction for `type FooProps = { ... }`.
- Done: Add Next.js-style file-route mapping for `app/**/page.tsx` and `pages/**/*.tsx`.
- Done: Add prop/member ownership for `React.FC<Props>`, `FC<Props>`, and `FunctionComponent<Props>` component annotations.
- Done: Resolve React barrel re-export files for import and re-export relationships.
- Done: Add nested object member hints, Next client/server roles, and Next API route handler mapping.
- Next: harden additional TypeScript/React syntax found in real projects, especially inference, utility/generic props, workspace boundaries, and generated declarations.

## Non-Goals Right Now

- Full visual graph browser.
- Team sync or collaboration features.
- Broad framework expansion beyond the current first-pass React/TypeScript analyzer while C#/.NET and web app flows continue to harden.
- Automatic deletion or cleanup.
- Whole-repo summaries that replace targeted queries.
- Styling-heavy docs work that does not improve the agent workflow.

## Success Metrics

Atlas is improving if:

- The top three recommended files include the eventual edit files.
- Agents open fewer unrelated files before making a change.
- `pattern-map` identifies the pattern a human maintainer would copy.
- Drift candidates are usually either real issues or intentional exceptions.
- Context packs fit in one agent turn without losing the important files.
- Alpha users describe the output as "that is how this repo works."

## Suggested Next Implementation Tasks

1. Done: harden object-shaped TypeScript props aliases discovered while expanding the React fixture coverage.
2. Done: add pattern-specific feedback prompts to `ALPHA_FEEDBACK.md` for React misses.
3. Done: add a small Next.js-style fixture and file-route mapping for app-router/pages-router pages.
4. Done: connect `React.FC<Props>`-style component annotations to prop/member relationships.
5. Done: resolve React barrel re-exports for cleaner import and component edges.
6. Done: add nested object member hints for common prop shapes such as Next.js `params.workflowId`.
7. Done: add lightweight Next client/server roles and API route handler mapping.
8. Next: validate React/Next query quality on a larger real project or convert alpha misses into fixture variants.
9. Done: add first-pass inferred props for nested destructuring, rest props, and simple default-value type/optionality hints.
10. Next: deepen checker-backed inferred prop types, richer default-value refinement, nested arrays, alias/default pattern edge cases, and generic component inference.
11. Done: add first-pass broad `Record<string, T>` and TypeScript index-signature prop members, with JSX fallback edges for string-indexed attributes.
12. Done: add finite template-literal key expansion for inline literal-union utility props.
13. Next: deepen utility-prop coverage for key remapping, conditional mapped types, referenced template-literal aliases, numeric/symbol/template index fallback, and checker-backed value/optional types.
14. Done: add first-pass generic function component parsing with type-parameter nodes, typed props ownership, and JSX type-argument edges.
15. Done: add first-pass JSX type-argument substitution in generic prop-flow evidence for explicit generic component usages.
16. Done: add first-pass generic props-alias parameter remapping when component props bind alias type parameters.
17. Done: add first-pass local generic type-alias expansion in generic prop-flow evidence.
18. Done: expand imported nested generic type aliases in generic prop-flow evidence.
19. Done: use declared generic defaults for JSX prop-flow evidence when explicit type arguments are omitted.
20. Done: complete the immediate behavior-preserving `reactAnalyzer.ts` split. Completed the shared type/text/import/ID helper, source-text scanning helper, route/store/context conventions, compiler-AST TypeScript declaration/type-parameter discovery, JSX composition/prop evidence, generic prop evidence, prop utility/index-signature, and TypeScript member-discovery extractions; `reactAnalyzer.ts` is now below the immediate size guardrail.
21. In progress: continue the `queryService.ts` split by extracting remaining command branches into intent handlers. Done: project metadata and symbol lookup moved to `queryBasic.ts`; code-health queries moved to `queryCodeHealth.ts`; references/relationships moved to `queryRelationships.ts`; pattern/pattern-map/hotspots moved to `queryPatterns.ts`; search/exact-file query handling moved to `querySearch.ts`; flow-context helpers moved to `queryFlowContext.ts`; endpoint-location enrichment moved to `queryNodeLocations.ts`; where-to-add orchestration moved to `queryWhereToAdd.ts`; query-service tests split by intent. Next: pause additional query-service extraction unless it grows again, and resume React/TypeScript semantic hardening.
22. Done: add first-pass value-derived JSX generic substitutions for literal and literal-array props when explicit JSX type arguments are omitted. Next: add checker-backed generic constraints and richer value inference.
23. Next: add a workspace/package-manager fixture for pnpm/yarn/npm package boundaries, generated declarations, package exports, project references, path aliases, and mixed JS/TS package boundaries.
24. Next: add .NET Minimal API route-group and endpoint-filter fixture coverage.
25. Done: split `test/webAnalyzer.test.ts` by scenario after the related production modules were extracted. `test/queryService.test.ts` has also been split by query intent.
26. Done: harden `where-to-add` for template-backed profile/persona detail fields so AdminTools object/type management ranks ahead of runtime PersonaInfo and Identity account pages, even when the query is scoped to WebUI.
