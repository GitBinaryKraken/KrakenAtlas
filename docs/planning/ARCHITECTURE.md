# Architecture Plan

## System Shape

Kraken Atlas uses a thin VS Code workspace extension and an out-of-process
Cartographer service. The service owns analysis, SQLite, graph algorithms, and
Context Pack construction.

```text
VS Code extension -----------+
CLI -------------------------+--> Cartographer --> SQLite Atlas
VS Code agent tools ---------+         |
MCP clients -----------------+         +--> Roslyn analyzer
                                        +--> .NET framework analyzers
                                        +--> database analyzers
                                        +--> TypeScript/React worker
                                        +--> SCIP and syntax adapters
```

All clients use the same versioned query contract. UI code does not read SQLite
directly and analyzers do not write SQLite directly.

## Technology Baseline

- **Cartographer:** self-contained .NET 10 console application.
- **Storage:** SQLite through `Microsoft.Data.Sqlite`, using WAL mode, migrations,
  prepared statements, and batched transactions.
- **VS Code extension:** TypeScript, running as a workspace extension beside the
  source tree in local, SSH, WSL, container, and Codespaces environments.
- **Protocol:** JSON-RPC 2.0 with content-length framing over standard I/O for
  extension-to-Cartographer communication.
- **Agent surfaces:** a bundled MCP stdio server registered by VS Code and CLI
  commands over the same internal query services. Native VS Code Language Model
  Tools remain optional because they would duplicate this surface.
- **TypeScript analyzer:** a bundled Node worker using the project's TypeScript
  version when compatible, with a bundled fallback.

The first release targets desktop and remote Node extension hosts. A browser-only
`vscode.dev` implementation is not part of the initial architecture.

## Cartographer Modules

### Core

Owns canonical entity and relation types, stable identity contracts, analyzer
capabilities, query requests, query results, diagnostics, and index generations.

### Workspace Discovery

Discovers `.sln`, `.slnx`, `.csproj`, `global.json`, `Directory.Build.*`,
`package.json`, lockfiles, `tsconfig.json`, project references, and multi-root VS
Code workspaces. It builds a project graph before semantic indexing begins.

Workspace discovery also emits first-class orientation facts:

- Project roles including application, library, test, ASP.NET Core host, worker,
  migration, database, frontend, tool, and generator.
- Target frameworks, SDKs, package managers, major framework markers, build
  configurations, runtime identifiers, and conditional source inclusion.
- Executable hosts and entry points, including web hosts, hosted services,
  workers, migration runners, and frontend development/build hosts.
- Build, test, run, format, generate, package, and migration commands extracted
  from structured sources such as project targets, package scripts, task files,
  and CI workflows.
- Repository conventions and instructions from `.editorconfig`,
  `Directory.Build.*`, analyzer configuration, `global.json`, contribution files,
  agent instruction files, and supported documentation sections.

Commands and conventions retain source evidence, scope, conditions, authority,
and precedence. Structured configuration facts use the code/build relation
domain. Prose instructions remain document sections in the documentation domain,
but orientation queries can report that governing instructions exist and provide
their exact documentation links.

Clients must not have to open and reinterpret workspace files to determine basic
project roles, supported build commands, or governing repository rules.

### Roslyn Analyzer

Uses Roslyn Workspaces and semantic models to emit compiler-bound facts. It owns
C# symbol identity and should emit:

- Declarations and all declaration locations, including partial types.
- Calls with selected overload, receiver type, and dispatch classification.
- References, construction, type use, inheritance, implementation, and override
  relationships.
- Read/write occurrences where Roslyn operation trees provide reliable roles.
- Diagnostics describing incomplete compilations or degraded fidelity.

Syntax-only fallback is allowed for projects that cannot load, but every result
must state its fidelity.

### ASP.NET Core Analyzer

Builds framework-specific entities and relations from Roslyn facts:

- Controller/action routes and HTTP methods.
- Minimal API route registrations and mapped handlers.
- Middleware pipeline ordering where it is statically visible.
- Dependency-injection registrations and constructor injection.
- Request and response DTOs, authorization policies, and endpoint metadata.

Framework recognizers must identify APIs by resolved symbols, not method names
alone.

### Database Analyzer

Database extraction is static and evidence-based by default.

1. Resolve EF Core framework symbols through Roslyn.
2. Map `DbContext`, `DbSet<T>`, entity declarations, attributes, and fluent model
   calls.
3. Interpret migrations and model snapshots into versioned logical schema facts.
4. Resolve constant SQL passed to known EF Core, Dapper, ADO.NET, and migration
   APIs.
5. Parse SQL using a provider-specific dialect adapter.
6. Connect code symbols and methods to the database objects they map, read,
   write, execute, or migrate.

SQL Server should be the first dialect adapter unless the benchmark fixture set
shows a different priority. PostgreSQL, SQLite, and MySQL are separate adapters,
not one permissive generic parser.

Default indexing must not instantiate a `DbContext`, invoke a design-time
factory, execute migrations, run MSBuild targets beyond required project
evaluation, or connect to a database. A trusted, explicitly enabled runtime EF
model adapter can be considered later.

### TypeScript and React Analyzer

The worker loads `tsconfig.json` and uses the TypeScript `Program` and
`TypeChecker` for semantic facts. React recognizers then derive:

- Function and class components.
- JSX component usage and render relationships.
- Custom hooks and hook calls.
- Context providers and consumers.
- React Router route-to-component relationships.
- Typed HTTP client calls and literal route evidence.

Cross-stack endpoint matching occurs in Cartographer after both project families
have produced canonical HTTP entities. Ambiguous route matches remain explicit.

### Documentation Analyzer

The documentation analyzer indexes Markdown and other explicitly supported
repository documents into document and section entities. It extracts headings,
anchors, links, code references, endpoint identifiers, database identifiers,
ADRs, runbooks, and supersession metadata.

Documentation uses a separate FTS index and a `documentation` relation domain.
Explicit links and compiler-resolved identifiers outrank lexical mentions.
External prose is never emitted as a compiler reference or code usage.

### Query Engine

Uses SQLite for filtering, hierarchy, bounded recursive traversal, FTS, and
evidence lookup. Weighted path finding, k-shortest Routes, and selected centrality
algorithms operate on a constrained in-memory adjacency set loaded from SQLite.

The query engine never loads the entire Atlas merely to answer a local query.

### Context Pack Builder

Builds source context in five stages:

1. Seed candidates from exact identity, FTS, current editor, diagnostics, and
   explicit files or symbols.
2. Expand through relation types relevant to the requested task.
3. Rank by match quality, graph distance, provenance, relation importance,
   freshness, and architectural role.
4. Select signatures, documentation, exact source slices, and concise Routes
   under the requested token budget.
5. Return omissions, ambiguity, freshness, and a reason for every included item.

Whole files are included only when requested or when the file itself is the
smallest coherent source unit.

Documentation is selected through a separate documentation query and policy.
The builder reports code and documentation token consumption independently and
does not silently expand code usage queries into prose search.

### Node Knowledge and Assessment Service

The service assembles bounded entity knowledge envelopes from canonical facts,
typed facets, derived projections, documentation links, and optional accepted
agent assessments. It owns analysis sessions, schema-validated assessment
claims, evidence, dependency fingerprints, conflict state, supersession, and
automatic staleness after generation changes.

Assessment writes use explicit protocol capabilities and Workspace Trust. They
never update compiler-owned facts or store raw chain-of-thought. Read queries can
select facts only, assessments only, or a labeled combination under an explicit
assessment policy.

The write boundary is the schema-validated `decorate_nodes` application
operation. CLI, JSON-RPC, MCP, and VS Code adapters pass the same versioned
batch to it. The service pins writes to an expected Atlas generation, resolves
stable node selectors, captures dependencies, and commits the analysis session
and claims transactionally.

The command dispatches a discriminated set of update intents rather than a
generic property bag. It can classify roles, maintain assessment-owned feature or
pattern groups, add assessed edges and behavioral facets, link tests and docs,
record gaps, and review prior claims. Internal dimensions and storage projections
are selected by Cartographer, not supplied as arbitrary table names by agents.

## Incremental Indexing

- Files are content-hashed and C# analyzer output is partitioned into compressed
  per-project cache entries in the same SQLite Atlas.
- An unchanged workspace fingerprint returns the active generation without
  running Roslyn or opening a write transaction.
- A changed project invalidates its transitive project dependents. Unaffected
  cache entries are merged with fresh analyzer output before one complete Atlas
  generation is committed atomically.
- Cross-project route-template matches are rebuilt from the merged semantic set
  so HTTP links do not depend on a direct project reference.
- Project removal invalidates all current C# projects; rename and deletion facts
  disappear because only the merged current semantic set moves into the new
  generation.
- Future public-surface classification will narrow dependent work from project
  granularity to affected files and symbols.
- Unsaved editor buffers can produce an in-memory overlay identified separately
  from the durable Atlas generation.
- Every query reports durable generation, overlay state, and known stale or
  failed projects.

## Security and Trust

- Respect VS Code Workspace Trust before project evaluation or child-process
  launch.
- Do not execute application code during normal indexing.
- Exclude secrets, generated outputs, package caches, and vendor directories by
  policy.
- Context Packs apply a denylist for secret-bearing files and report exclusions.
- Analyzer processes receive explicit workspace roots and cannot write source.
- SQL parsing never sends SQL or source to a remote service.

## Proposed Repository Layout

```text
src/
  KrakenAtlas.Cartographer/
  KrakenAtlas.Core/
  KrakenAtlas.Protocol/
  KrakenAtlas.Storage.Sqlite/
  KrakenAtlas.Analyzers.Roslyn/
  KrakenAtlas.Analyzers.AspNetCore/
  KrakenAtlas.Analyzers.Database/
  KrakenAtlas.Query/
  vscode/
  typescript-analyzer/
tests/
  fixtures/
  unit/
  integration/
benchmarks/
docs/
  planning/
```

Analyzer assemblies depend on Core contracts. Storage and protocol adapters
depend on Core. Core has no dependency on VS Code, SQLite, Roslyn, or Node.
