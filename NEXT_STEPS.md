# Kraken Atlas Next Steps

Kraken Atlas is moving from "query before reading" toward "pattern-aware editing."

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

Pattern mapping is the right center of gravity because it connects existing Atlas strengths: symbol indexing, route discovery, config relationships, project dependencies, ownership hints, duplicate detection, and agent-readable output.

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
- Done: extracted flow edge ranking, composition, JavaScript interaction promotion, flow coverage scoring, flow caveats, and shared graph predicates into `queryFlow.ts`.
- Done: extracted search row ranking, weak-match detection, relationship-term scoring, pattern scoring, and reference fallback guidance into `querySearch.ts` and `queryReferences.ts`.
- Done: extracted hotspot and architecture-risk summary construction, role scoring, usage-summary shaping, and guidance text into `queryHotspots.ts`.
- Done: extracted `plan-change` response composition, shared-contract checklist assembly, avoid-hotspot shaping, and context-pack command generation into `queryPlanning.ts`, reducing `queryService.ts` to query orchestration for that command.
- Done: extracted value-lifecycle relationship lookup, C# symbol/member anchor discovery, and identifier term helpers into `queryValueLifecycle.ts`, keeping Razor/model-binding/C# property bridge behavior stable.

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

Current status: `0.2.2` packaged the semantic foundation: TypeScript project discovery, compiler-backed import resolution, compiler-AST declaration/member nodes, type-only imports, package export facts, namespace/default barrel resolution, and first-pass JSX prop edges to declared members. The `Unreleased` queue now extends that foundation with generic/type relationships, imported function/hook/store call resolution, imported prop aliases, inherited and utility props, inferred destructured props, and mixed JavaScript/TypeScript fixture coverage.

Keep the next slices fixture-backed. The remaining gap is not "React exists" anymore; it is how accurately Atlas follows TypeScript semantics without flooding query output.

High-priority semantic slices:

1. Done: build a TypeScript project discovery layer that finds `tsconfig.json`, workspace package roots, path aliases, JSX settings, and project references as queryable map facts.
2. Done: resolve React/TypeScript imports through TypeScript's compiler module resolver using discovered `tsconfig` settings, including alias imports to barrel files and implementation files.
3. In progress: add a broader TypeScript compiler-backed analyzer path for `.ts`, `.tsx`, `.js`, and `.jsx` symbols/types, keeping the current parser as a fallback for incomplete or dependency-light workspaces. First compiler-AST declaration pass now emits queryable interfaces, object type aliases, scalar type aliases, enums, enum members, and member summaries.
4. In progress: expand import/export graphs through TypeScript module resolution, including package `exports`, default exports, namespace imports, and type-only imports. Type-only imports now emit distinct `TYPE_IMPORTS_MODULE` relationships and `typescript-type-import` references, namespace JSX member usage resolves through barrel re-exports, `package.json` export surfaces are queryable package-export nodes, package-subpath imports can resolve through workspace package exports, default imports can follow default barrel re-exports, JSX default import aliases can resolve back to the actual component, and named import/re-export aliases are covered for React barrel files. Deeper external package resolution and more default export alias semantics remain.
5. In progress: use TypeScript semantics to connect JSX props to declared prop types, inferred props, generic components, union/intersection props, `ComponentProps<>`, and imported type aliases. JSX props now resolve to known declared prop member nodes, intersection aliases with inline object members are mapped, first-pass `ComponentProps<typeof Component>` aliases can point back to their source component, imported prop type aliases can resolve to shared prop declarations, inherited props now emit `EXTENDS_PROPS` plus inherited `PASSES_PROP` edges, first-pass utility props for `Pick`, `Omit`, `Partial`, `Required`, `Readonly`, finite-key `Record`, and simple mapped types can resolve to prop members, and untyped destructured component parameters now emit inferred prop nodes; full type-checker-backed inference, broad index signatures, complex mapped types, and generic prop expansion remain.
6. In progress: emit semantic nodes for interfaces, type aliases, enum/object literal contracts, generic type parameters, discriminated unions, and exported API/client types. Interfaces, object type aliases, scalar type aliases, literal union values, enums, enum members, member summaries, generic type parameters, first-pass discriminated-union variants, exported API/client contract patterns, local `REFERENCES_TYPE` edges, and generic argument edges are covered; deeper checker-backed generic expansion remains.
7. In progress: map call graphs from resolved symbols rather than name-only matches, including hooks, service helpers, API clients, route handlers, and state-store actions. Imported function calls, namespace imported calls, and imported hook/store calls now prefer compiler/import-resolved declarations and emit resolved references; full checker-backed call graph resolution remains.
8. In progress: add semantic relationship confidence fields/evidence so query output can distinguish compiler-resolved edges from convention or text-derived edges. First-pass import-resolved evidence markers now appear on resolved React call and hook relationships.
9. In progress: add fixture variants for monorepos, pnpm/yarn workspaces, generated declaration files, and mixed JavaScript/TypeScript projects. Mixed `.jsx` plus TypeScript barrel coverage is now present in `ReactNextPortal`; workspace/package-manager and generated-declaration variants remain.

TypeScript/React coverage gaps to close:

- High priority: deepen utility-prop expansion beyond first-pass finite-key `Record<K, V>` and simple mapped types, including broad index signatures, key remapping, template-literal keys, conditional mapped types, and checker-backed optionality/value types.
- High priority: expand generic props beyond first-pass names, including generic components, generic type aliases, generic constraints/defaults, and concrete JSX type arguments.
- High priority: deepen inferred component props beyond first-pass destructured parameters, including nested destructuring, rest props, default-value type refinement, and checker-backed inferred prop types.
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
9. Next: deepen inferred props for nested destructuring, rest props, default-value refinement, and checker-backed inferred prop types.
10. Next: deepen utility-prop coverage for broad index signatures, key remapping, template-literal keys, conditional mapped types, and checker-backed value/optional types.
11. Next: expand generic prop coverage for generic components, generic type aliases, constraints/defaults, and concrete JSX type arguments.
12. Next: add a workspace/package-manager fixture for pnpm/yarn/npm package boundaries, generated declarations, package exports, project references, path aliases, and mixed JS/TS package boundaries.
13. Next: add .NET Minimal API route-group and endpoint-filter fixture coverage.
14. Optional: continue command-handler splits if React work shows `queryService.ts` is still too dense for agent edits.
