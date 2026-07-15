# Product Scope

## Mission

Kraken Atlas reduces agent context use by turning a workspace into a durable,
queryable semantic map. It should answer structural questions and construct a
small Context Pack without requiring an agent to rediscover the codebase through
repeated file listing, grep, and full-file reads.

The index is local, deterministic, inspectable, and useful without an LLM.

## Primary Workspaces

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

1. Find the exact symbol meant by a name without silently choosing an ambiguous
   basename.
2. Inspect callers, callees, inheritance, implementation, dependency, endpoint,
   and data-access relationships with source evidence.
3. Trace a directed Route through selected relationship dimensions.
4. Estimate the impact of changing a symbol, endpoint, DTO, entity, or database
   object.
5. Request a token-budgeted Context Pack and understand why each item was
   selected.
6. Navigate every returned fact back to a file and source range.
7. Retrieve documentation that explains or governs an exact code object without
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
