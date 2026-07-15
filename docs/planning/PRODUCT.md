# Product Scope

## Mission

Kraken Atlas reduces agent context use by turning a workspace into a durable,
queryable semantic map. It should answer structural questions and construct a
small Context Pack without requiring an agent to rediscover the codebase through
repeated file listing, grep, and full-file reads.

The index is local, deterministic, inspectable, and useful without an LLM.

## Primary Workspaces

### Complete Workspace Orientation

Before semantic feature analysis, the Atlas must provide a durable, queryable
orientation layer containing:

- Solutions, projects, project and package dependencies, languages, SDKs, target
  frameworks, build configurations, platforms, and runtime identifiers.
- Multi-valued project roles including application, library, test, ASP.NET Core
  host, worker, migration, database, frontend, tool, and generator.
- Executable hosts and entry points.
- Build, test, run, format, generate, package, and migration commands with their
  working directory, target scope, conditions, and source evidence.
- Repository conventions and instructions with category, scope, authority,
  precedence, freshness, and exact source.

Clients should not need to rediscover these facts by repeatedly listing files or
reading project manifests, CI workflows, contribution guides, and instruction
documents. Structured build facts and documentation sections remain separate
relation domains, but `get_workspace_orientation` can return their linked,
bounded orientation projection.

### Reusable Node Knowledge

Every canonical entity should expose bounded knowledge dimensions for workspace
orientation, feature and pattern membership, behavior Routes, contracts, side
effects, change surface, failure paths, lifecycle, tests, and documentation.

Most dimensions are produced automatically and offline. When intent, preferred
precedent, feature boundary, or risk cannot be determined statically, an AI agent
may save a typed assessment with evidence and invalidation dependencies. Future
agents can reuse current assessments without confusing them with canonical
compiler facts or repeatedly performing the same analysis.

Agents enrich nodes through typed intents: role classification, feature or
pattern membership with participant roles, assessed relations, behavior,
effects, contracts, failure and lifecycle facets, change guidance, test and
documentation links, Landmarks, precedents, dynamic-target resolutions,
knowledge gaps, and assessment review. This lets the Atlas learn useful project
structure while keeping agent-authored grouping nodes visibly separate from
analyzer-owned code entities.

### Modern .NET and C#

The first-class target is a solution or workspace containing modern .NET and
ASP.NET Core projects. The Atlas should understand:

- Solutions, projects, target frameworks, project references, and NuGet package
  references.
- Namespaces, types, records, interfaces, enums, delegates, members, parameters,
  generic constraints, attributes, and partial declarations.
- Compiler-resolved references, calls, overloads, construction, inheritance,
  implementation, overrides, reads, writes, and type use.
- ASP.NET Core controllers, actions, Minimal API endpoints, middleware, filters,
  hosted services, dependency-injection registrations, options, and authorization
  policies.
- Common architectural patterns when they can be identified from compiler facts,
  without treating naming conventions as certainty.

### Code-Defined Database Topology

Database objects are a first-class part of the Atlas, not metadata attached to a
file node. Initial sources include:

- EF Core `DbContext`, `DbSet<T>`, entity types, data annotations, fluent model
  configuration, owned types, keys, relationships, indexes, value converters,
  query filters, table/schema mapping, and inheritance mapping.
- EF Core migrations and model snapshots, including tables, columns, keys,
  constraints, indexes, sequences, and SQL operations.
- Dapper and ADO.NET calls whose SQL can be resolved from constants or bounded
  string construction.
- `FromSql`, `ExecuteSql`, migration SQL, and other embedded SQL entry points.
- Stored procedures, functions, views, triggers, and other objects when they are
  declared or referenced in code or migration SQL.

The initial index maps what the repository defines or references. Connecting to
a live database is a later validation capability, not an indexing prerequisite.

### TypeScript and React

TypeScript and React are the second first-class stack. The Atlas should
understand:

- TypeScript projects, project references, modules, exports, types, symbols,
  calls, inheritance, implementations, and module resolution.
- React components, JSX render relationships, props, custom hooks, hook use,
  contexts, providers, consumers, event handlers, and application routes.
- Fetch, Axios, generated clients, and other statically identifiable HTTP calls.
- Cross-stack matching between a TypeScript request and an ASP.NET Core endpoint
  by HTTP method, normalized route template, and contract evidence.

An important target Route is:

```text
React route or component
  -> client function or query hook
  -> HTTP request
  -> ASP.NET Core endpoint
  -> application service or handler
  -> repository or DbContext operation
  -> database table, view, or procedure
```

### Documentation Connected to Code

The Atlas should eventually index repository documentation as addressable
documents and sections, then link those sections to code, endpoint, React, and
database entities. Documentation is a connected dimension, but documentation
mentions are not code usages.

Kraken Atlas therefore exposes separate operations for finding semantic code usages
and finding documentation related to an entity. Context Packs include
documentation only under an explicit documentation policy and account for its
token use separately.

## Product Outcomes

The first useful release must let a developer or agent:

1. Retrieve complete workspace topology, project roles, build dimensions,
   supported commands, and governing conventions with evidence.
2. Find the exact symbol meant by a name without silently choosing an ambiguous
   basename.
3. Inspect callers, callees, inheritance, implementation, dependency, endpoint,
   and data-access relationships with source evidence.
4. Trace a directed Route through selected relationship dimensions.
5. Estimate the impact of changing a symbol, endpoint, DTO, entity, or database
   object.
6. Request a token-budgeted Context Pack and understand why each item was
   selected.
7. Navigate every returned fact back to a file and source range.
8. Retrieve documentation that explains or governs an exact code object without
   mixing documentation mentions into code usage results.

## Principles

- Compiler truth before parser inference.
- Explicit ambiguity before convenient guessing.
- Every important relationship has provenance and source evidence.
- One canonical Atlas supports multiple projections; projections are not copied
  graph files.
- Indexing and querying do not require an LLM.
- The extension host remains responsive; analysis runs out of process.
- Database topology and cross-stack Routes are core capabilities.
- Correctness and retrieval quality are benchmarked before visual polish.

## Initial Non-Goals

- Broad but shallow support for dozens of languages.
- General database administration or schema deployment.
- Executing arbitrary workspace code during default indexing.
- Runtime tracing, production telemetry, or distributed tracing.
- LLM-authored summaries as the source of architectural truth.
- A visual architecture editor that modifies source code.
- Compatibility or migration layers for CodeKraken or KrakenAtlas data.
