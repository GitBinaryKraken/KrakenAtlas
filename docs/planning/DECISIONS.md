# Decision Log

This file records planning decisions before implementation ADRs exist. Accepted
decisions may later be promoted into individual ADR files.

## Accepted

### D-001: SQLite is the durable Atlas store

The map is stored as typed relational facts with graph projections, FTS, and
evidence tables. Clients do not query the database directly.

### D-002: Cartographer is an out-of-process .NET 10 service

C# and database mapping are the primary product capabilities. A .NET host gives
Roslyn and `Microsoft.Data.Sqlite` first-class ownership while isolating indexing
from the VS Code extension host.

### D-003: Roslyn and the TypeScript Compiler API are primary analyzers

Tree-sitter is a fallback for syntax coverage, not the semantic authority for C#
or TypeScript.

### D-004: Code-defined database objects are first-class entities

EF Core models, migrations, embedded SQL, Dapper, and ADO.NET produce database
entities and data-access relations in the same Atlas as code symbols.

### D-005: Static analysis does not execute application code by default

Default indexing does not instantiate contexts, invoke design-time factories,
run migrations, or connect to a live database. Any runtime model inspection must
be a later trusted opt-in mode.

### D-006: One query contract serves every product surface

The extension UI, native agent tools, MCP, and CLI adapt the same internal query
services and ranking behavior.

### D-007: No LLM is required for indexing or querying

LLM-generated summaries and embeddings are optional future retrieval signals.
They cannot become canonical architectural facts.

### D-008: Cross-stack Routes are a primary feature

The model must support React component -> HTTP request -> ASP.NET Core endpoint
-> application code -> database object without creating a separate frontend or
database graph.

### D-009: Competitor and CodeKraken implementations are research only

Kraken Atlas starts from scratch. Local competitor repositories remain ignored and
no CodeKraken code or feature implementation is imported.

### D-010: Documentation uses a separate query and relation domain

Documentation entities remain connected to code, endpoint, React, and database
entities inside the Atlas. Code usage queries traverse the `code` domain;
documentation queries traverse the `documentation` domain. Context Packs merge
documentation only under an explicit policy and report its token cost separately.

### D-011: Clients provide the Atlas storage path

The VS Code extension uses its per-workspace `storageUri` and passes the database
path during Cartographer initialization. CLI and future MCP clients pass an
explicit Atlas path. Cartographer alone owns migrations, transactions, and
queries; the repository never contains the generated SQLite database.

### D-012: Workspace orientation is canonical Atlas data

Solutions, projects, multi-valued project roles, frameworks, target frameworks,
dependencies, executable hosts, build dimensions, supported commands, and
governing repository conventions are persisted as queryable facts with evidence
and freshness. Clients do not reconstruct this orientation layer from filenames
or repeated source reads.

Structured build and configuration rules use the code/build relation domain.
Prose instructions remain in the documentation domain, while orientation facts
record their scope, authority, precedence, and document-section identity.

### D-013: Agent conclusions use a separate assessment ledger

Reusable AI analysis is stored as typed assessment claims linked to canonical
entities. Each claim records its analysis session, evidence, input dependencies,
scope, confidence where meaningful, status, and validated generation. Claims can
be accepted, disputed, superseded, rejected, or marked stale.

Assessments never overwrite compiler, configuration, framework, or parser facts.
The Atlas stores concise conclusions and evidence, not private chain-of-thought,
raw prompts, or unbounded transcripts. Dependency changes invalidate claims so a
future agent can revalidate rather than unknowingly reuse stale analysis.

### D-014: Agent node decorations use one versioned JSON command

Agents submit assessments through a strict Draft 2020-12 JSON Schema and the
shared `decorate_nodes` application operation. Every batch is pinned to a
workspace and expected Atlas generation, uses exact node selectors, contains
evidence, and has idempotent transactional semantics.

This lets Codex, other agents, CLI scripts, MCP clients, and VS Code record
reusable knowledge without database coupling or adapter-specific behavior.
Adding fields, dimensions, or claim kinds requires compatible schema evolution;
the command cannot overwrite canonical analyzer facts.

### D-015: AI enrichment uses typed intents and assessment-owned groups

The agent does not submit a generic node property bag or choose Atlas tables. A
decoration contains one discriminated update intent, such as role
classification, pattern membership, assessed relation, behavior, failure,
lifecycle, test link, precedent, runtime resolution, knowledge gap, or prior
assessment review. Cartographer derives the internal dimensions and projections.

Agents may create workspace-scoped grouping nodes for features, patterns,
Blueprints, workflows, boundaries, capabilities, and concerns. These remain in
the assessment plane, with evidence and freshness, and cannot impersonate
compiler-owned code nodes. This gives agents a useful shared vocabulary while
preserving the trust boundary around canonical analysis.

## Proposed Defaults Requiring Review

### Q-001: First SQL dialect

Proposed default: SQL Server through `Microsoft.SqlServer.TransactSql.ScriptDom`,
with provider-specific PostgreSQL, SQLite, and MySQL adapters following.

Decision needed before Phase 3 fixture implementation.

### Q-003: Stable C# symbol key format

Proposed default: an internal numeric ID plus an analyzer-owned key containing
workspace/project identity and a Roslyn-derived symbol identity. Documentation
IDs alone are insufficient for every symbol kind.

A prototype must prove stability across process restart, unrelated edits,
overloads, partial types, file moves, and target frameworks before Phase 2.

### Q-004: TypeScript version selection

Proposed default: prefer the workspace TypeScript package when it satisfies the
analyzer compatibility range; otherwise use the bundled version and emit a
fidelity diagnostic.

Decision needed before Phase 4.

### Q-005: Public product identity

Working repository and extension name: Kraken Atlas. The architectural feature names
Atlas, Blueprint, Routes, Landmarks, Context Pack, and Cartographer are accepted.
Marketplace display name and extension identifier remain open.

Decision needed before external packaging, not before core implementation.

## Deferred

- Live database schema validation and drift detection.
- Runtime EF Core model extraction in trusted mode.
- Additional semantic analyzers beyond C#, TypeScript, React, and imported SCIP.
- Embeddings and semantic reranking.
- Runtime traces and telemetry-derived Routes.
- Team-shared or server-hosted Atlases.
