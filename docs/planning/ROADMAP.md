# Delivery Roadmap

The roadmap is correctness-first. Each phase ends with a usable vertical slice
and a measurable gate.

## Phase 0: Planning and Ground Truth

Status: structural baseline complete; expanded workspace orientation required.

Deliverables:

- Product, agent query, architecture, Atlas model, roadmap, benchmark, and
  decision documents.
- Hand-authored fixture requirements for C#, ASP.NET Core, EF Core, SQL access,
  TypeScript, React, and a complete cross-stack feature.
- A versioned relation vocabulary and analyzer output contract.
- Initial performance and retrieval targets.

Exit gate:

- High-impact open decisions have owners or explicit defaults.
- Every Phase 1 component has a defined boundary and test strategy.

## Phase 1: Walking Cartographer

Status: complete.

Deliverables:

- .NET solution and TypeScript workspace scaffolding.
- Cartographer process lifecycle and versioned JSON-RPC handshake.
- SQLite migration runner, generation transactions, and repository layer.
- Minimal VS Code workspace extension that starts Cartographer and displays index
  status without eager activation.
- Workspace discovery for .NET solutions and projects.
- Multi-valued project facets for applications, libraries, tests, web hosts,
  workers, migration/database projects, frontends, tools, and generators.
- Framework, target-framework, build-configuration, runtime, and conditional
  compilation facts.
- Queryable build, test, run, format, generation, package, and migration commands.
- Repository conventions and governing instructions with scope, evidence, and
  precedence.
- `get_atlas_summary` and exact entity lookup through CLI and extension.
- `get_workspace_orientation` through the shared query contract.

Exit gate:

- The extension host performs no project analysis.
- A fixture workspace can be indexed, queried, closed, reopened, and queried from
  the same durable Atlas.
- Failed or cancelled indexing leaves the previous generation intact.
- A mixed fixture workspace returns every project role, host, target framework,
  dependency, supported command, and governing rule without client-side file
  interpretation.
- Conflicting or scoped instructions are returned with explicit precedence and
  documentation links rather than silently merged.

## Phase 2: C# Semantic Atlas and Agent Loop

Deliverables:

- Roslyn project loading, declarations, locations, references, calls, type use,
  inheritance, implementations, overrides, and diagnostics.
- Stable symbol keys and explicit ambiguous or unresolved targets.
- Symbol search, code-only usage queries, neighbors, execution/dependency Routes,
  and impact queries.
- First Context Pack builder with source slicing and token budgets.
- Native VS Code agent tools and MCP mode over the same query services.
- Bounded `get_entity_context` responses spanning semantic, feature, behavior,
  contract, effect, failure, lifecycle, test, and assessment dimensions.
- Versioned analysis sessions and the first assessment ledger for feature
  membership, architectural role, preferred precedent, and verification risk.
- Draft 2020-12 node-decoration JSON Schema and transactional `decorate_nodes`
  command shared by CLI, JSON-RPC, MCP, and VS Code adapters.
- Typed self-enrichment intents for roles, pattern/feature membership, assessed
  edges, behavior, effects, contracts, failure/lifecycle, change guidance,
  verification, Landmarks, precedents, design intent, constraints, aliases,
  runtime resolution, gaps, and review.
- Assessment-owned grouping nodes with participant roles for features, patterns,
  Blueprints, workflows, boundaries, capabilities, and concerns.
- Evidence and dependency-based assessment invalidation after Atlas generation
  changes.

Exit gate:

- C# semantic precision and recall meet the benchmark thresholds.
- Overloads, generics, interfaces, partial types, and duplicate names resolve to
  the fixture ground truth.
- An agent can answer the fixture architecture questions from Context Packs
  without unrestricted repository reads.
- A second agent can reuse a first agent's accepted feature assessment, and a
  source change marks that assessment stale without altering canonical facts.
- An agent-generated decoration batch can be dry-run, schema-validated, applied
  idempotently, and queried back without modifying canonical analyzer facts.

## Phase 3: ASP.NET Core and Database Atlas

Deliverables:

- Controllers, Minimal APIs, middleware, DI, authorization, and request/response
  contract mapping.
- Static EF Core model extraction from contexts, entities, attributes, fluent
  configuration, migrations, and model snapshots.
- SQL Server dialect adapter for code-defined and embedded SQL.
- Initial Dapper, ADO.NET, `FromSql`, `ExecuteSql`, and migration SQL mapping.
- HTTP, data, and endpoint-to-database Routes.

Exit gate:

- The full ASP.NET/EF fixture maps endpoint -> handler -> data operation ->
  database object with source evidence.
- Composite keys, owned entities, many-to-many joins, indexes, relationships, and
  migration changes match ground truth.
- No application or migration code executes during default indexing.

## Phase 4: TypeScript, React, and Full-Stack Routes

Deliverables:

- TypeScript project discovery, semantic symbols, module resolution, calls, and
  type relationships.
- React components, JSX renders, hooks, contexts, and client routes.
- Fetch, Axios, and generated-client request extraction.
- HTTP method and route-template matching to ASP.NET Core endpoints.
- Full-stack Context Packs and Routes.

Exit gate:

- React component -> client request -> ASP.NET endpoint -> service -> database
  Route matches fixture ground truth.
- Dynamic or nonliteral request URLs are marked unresolved rather than guessed.

## Phase 5: Incrementality, Documentation, Blueprints, and Landmarks

Deliverables:

- Project-aware invalidation and dependent-file rebinds.
- Unsaved document overlays.
- Document and section indexing with separate documentation FTS.
- Evidence-backed documentation-to-entity links and reverse lookup.
- Dedicated documentation queries, freshness, broken-link, and supersession
  diagnostics that remain separate from code usage queries.
- Saved Blueprint definitions.
- Relation-specific Landmarks and community detection.
- Index health, stale project, unresolved target, and storage diagnostics.

Exit gate:

- Leaf edits meet the incremental latency target.
- No stale facts survive rename, deletion, project-reference change, or failed
  re-index scenarios in the regression suite.
- Code usage fixtures return no documentation entities, and documentation queries
  meet their independent precision and freshness targets.

## Phase 6: Visual Atlas and Product Hardening

Deliverables:

- Atlas, Blueprint, Route, and Landmark views backed only by the query API.
- Semantic zoom and result limits suitable for large workspaces.
- Multi-platform VSIX packaging for supported desktop and remote hosts.
- Upgrade, schema migration, recovery, privacy, and telemetry policy.

Exit gate:

- Visual views remain useful and responsive on benchmark workspaces.
- The extension passes local, WSL, SSH, and container smoke tests.
- Query and Context Pack quality do not regress as UI features are added.

## Definition of the First Working Product

The first working product is reached at the end of Phase 3. It can index a modern
C# ASP.NET Core application, map its code-defined EF Core and SQL objects, answer
symbol and Route queries, and provide an evidence-backed Context Pack through VS
Code or MCP. TypeScript/React completes the planned primary stack in Phase 4.
