# Changelog

## Unreleased

## 0.7.5 - 2026-07-15

- Add Minimal API endpoint extraction for the common `Map*` methods, including
  static `MapGroup` prefixes, handler calls, request/response contracts, and
  `RequireAuthorization` policy entities.
- Add source-ordered ASP.NET Core middleware entities and `precedes` relations
  for common `Use*` methods and source-defined `UseMiddleware<T>` components.
- Add static EF Core context and `DbSet` discovery, table/column mapping from
  conventions, data annotations, and fluent `Entity<T>` builder callbacks.
- Add primary-key and index entities plus EF query, insert, update, and delete
  operations connected to mapped entities and database objects.
- Add static EF migration entities and common table, column, index, foreign-key,
  and migration-SQL operations without running migrations or application code.
- Unify exact qualified database objects referenced by EF Core and Dapper or
  embedded PostgreSQL SQL so agents receive one evidence-rich table node.
- Extend the deterministic feature-flow fixture with read and write Minimal API
  to EF Routes, middleware ordering, grouped routes, model metadata, and a
  migration. Validate Kelp at 11 projects, 672 files, 6,738 entities, and 16,763
  relations in 31.7 seconds.

## 0.7.0 - 2026-07-15

- Add the token-budgeted `prepare_change` workflow, combining a ranked static
  change surface, related tests, affected projects, verification commands, and
  reusable current assessments without embedding source bodies.
- Add SQLite schema v3 with a separate enrichment plane for analysis sessions,
  typed assessment claims, evidence, and captured freshness dependencies.
- Implement the version 1.0 `decorate_nodes` JSON contract with exact selectors,
  generation pinning, controlled update intents, atomic transactions, dry-run,
  accepted-to-proposed policy downgrades, and idempotent operation replay.
- Compute assessment freshness against current entity, relation, file, claim,
  and analyzer dependencies; stale claims are excluded from normal agent packs.
- Add `get_entity_assessments` with explicit proposed, stale, and history policy
  flags while keeping canonical fact queries free of AI-authored claims.
- Expose prepare, assessment, and decoration operations through CLI, JSON-RPC,
  the TypeScript client, and trusted-workspace VS Code commands.
- Prove role and feature-membership reuse, token bounds, idempotency, persistence,
  and source-change invalidation in the deterministic full-route fixture.

## 0.6.0 - 2026-07-15

- Add bounded `get_change_surface` queries over code, framework, and database
  relations with explicit dependency/dependent direction and exact evidence.
- Group direct neighbors, bounded transitive neighbors, related tests, affected
  projects, and focused build/test commands without claiming every result must
  be edited.
- Resolve graph entities to their owning projects through recursive containment
  and classify test projects from canonical workspace facts.
- Add canonical xUnit, NUnit, and MSTest `test_case` entities and
  `framework/executes_test` relations from recognized test attributes.
- Prevent default change-surface traversal from recursively expanding through
  high-fanout code `reads`, `writes`, and `uses_type` relations while preserving
  those relations directly on the seed and allowing explicit kind filters.
- Expose change surfaces through CLI, JSON-RPC, the TypeScript client, and the
  `Kraken Atlas: Show Change Surface` VS Code command.
- Extend the deterministic feature-flow fixture with a test project and prove
  exact test selection plus the focused `dotnet test` command.
- Validate a Kelp Persona service surface with 5 direct and 9 transitive facts,
  4 affected projects, and no truncation.

## 0.5.0 - 2026-07-15

- Add cross-domain entity search for code symbols, service registrations, HTTP
  endpoints and requests, database operations, and database objects.
- Extract attribute-routed ASP.NET Core controller endpoints with effective
  method/route templates, authorization classification, handlers, and evidence.
- Extract common scoped, transient, and singleton DI registrations, including
  service-to-implementation and exact interface-member dispatch relations.
- Extract statically recoverable outbound HTTP request templates and match them
  to compatible controller endpoints.
- Extract Dapper SQL operations and normalized PostgreSQL objects with operation,
  materialization, ownership, and source-evidence relations.
- Add bounded incoming/outgoing/bidirectional relation queries and forward Route
  tracing across code, framework, and database domains. Routes exclude
  structural containment by default and support ordered stable-key waypoints.
- Expose entity search, relation queries, and Routes through CLI, JSON-RPC, and
  VS Code commands with compact text renderers.
- Add a deterministic six-project feature-flow fixture that proves an 11-hop
  WebUI-to-PostgreSQL Persona Route through DI, HTTP, API, logic, and Dapper.
- Validate the same 11-hop public Persona Route against the local Kelp field
  benchmark at 6,594 entities and 16,190 relations.

## 0.4.0 - 2026-07-15

- Add the first Roslyn semantic Atlas with compiler-bound C# declaration
  identities, overload signatures, partial definition locations, visibility,
  generated/manual evidence, analyzer diagnostics, and semantic containment.
- Add exact internal calls, construction, field/property/event reads and writes,
  type use, inheritance, interface and member implementations, and overrides,
  with dispatch classification and exact compiler evidence.
- Add bounded C# symbol search through CLI, JSON-RPC, and VS Code, with stable
  results across Atlas generations and exact entity lookup from search results.
- Add bounded, filterable, code-only C# usage queries through CLI, JSON-RPC, and
  VS Code while keeping future documentation queries on a separate surface.
- Add semantic regression fixtures for duplicate names, overloads, partial types,
  generated source, inheritance, implementations, calls, construction, member
  access, dispatch, and documentation exclusion.
- Validate the Kelp field benchmark at 6,067 entities and 14,216 relations,
  including exact WebUI-to-connector, API-to-logic, and logic-to-data Persona
  calls across project boundaries.
- Await Cartographer process exit during restart and extension deactivation,
  with bounded shutdown and forced-termination fallbacks to prevent stale .NET
  processes from locking development and package output assemblies.
- Add a .NET 10 runtime preflight, source-free diagnostic export, invited-alpha
  testing instructions, and explicit privacy, storage, telemetry, and license
  status documentation.
- Add durable workspace orientation for C# and package.json projects, including
  multi-valued project facets, build dimensions and conditions, executable
  commands, structured repository rules, governing instruction references, and
  exact source evidence.
- Expose `get_workspace_orientation` through CLI, JSON-RPC, and VS Code, and add
  schema migration and mixed .NET/React fixture coverage for the new facts.

## 0.3.1 - 2026-07-15

- Replaced the legacy Kraken Atlas implementation with a clean architecture
  baseline derived from the new planning set.
- Preserved the published `BinaryKraken.kraken-atlas` Marketplace identity.
- Added a thin VS Code workspace extension and a .NET 10 Cartographer process.
- Added content-length framed JSON-RPC initialization, status, and shutdown.
- Added .NET solution, C# project, project-reference, and relevant-file
  discovery with deterministic identities and content hashes.
- Added a versioned SQLite schema, WAL mode, migration runner, atomic generation
  commits, stable entity IDs, relations, evidence, and analyzer-run records.
- Added Atlas build, summary, and exact entity queries through VS Code,
  JSON-RPC, and CLI.
- Added a fixture that proves durable reopen, stable identity across generations,
  and retention of the prior generation after failed discovery.
- Added integration tests across the extension/Cartographer protocol boundary.
- Added the product, architecture, Atlas, agent-query, roadmap, decision, and
  benchmark planning documents.
- Documented the AI feature-implementation workflow, additional relationship
  dimensions, feature Blueprints, precedent detection, and change-surface
  queries.
- Made complete workspace orientation a canonical Atlas requirement, including
  multi-valued project roles, hosts, build dimensions, commands, and repository
  conventions with evidence and precedence.
- Defined bounded node-knowledge dimensions and a separate, evidence-backed AI
  assessment ledger so future agents can reuse feature analysis without
  overwriting canonical facts or carrying stale conclusions forward.
- Added a versioned Draft 2020-12 JSON Schema, example payload, and shared
  `decorate_nodes` command contract for evidence-backed agent node decorations.
- Expanded node decoration into typed self-enrichment intents for roles,
  feature/pattern participation, assessed relations, behavior, operational
  facets, change guidance, tests, docs, Landmarks, runtime resolutions, knowledge
  gaps, and review of previous assessments.

## 0.3.0

- Reserved for the first release produced from the new architecture. The current
  branch is not ready to publish until the release checklist is completed.
