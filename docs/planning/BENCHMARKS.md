# Benchmark Plan

Kraken Atlas is successful only if its map is accurate and its Context Packs reduce
agent work without hiding required evidence.

## Fixture Matrix

### C# Language Fixture

Must include overloaded methods, extension methods, generics, nested types,
interfaces with multiple implementations, virtual overrides, records, partial
types, duplicate names in different namespaces, async calls, delegates, events,
and unresolved references.

### ASP.NET Core Fixture

Must include controllers, Minimal APIs, route groups, route parameters,
middleware, filters, authorization, DI lifetimes, options, hosted services, and
request/response DTOs.

### Database Fixture

Must include:

- EF Core conventions, attributes, and fluent configuration.
- Composite and alternate keys, owned entities, one-to-one, one-to-many,
  many-to-many, inheritance, indexes, value converters, and query filters.
- Migrations and a model snapshot with adds, renames, drops, constraints, and raw
  SQL.
- Dapper and ADO.NET reads and writes using constant and interpolated SQL.
- Tables, views, sequences, functions, and procedures defined or referenced by
  code.

### TypeScript and React Fixture

Must include project references, path aliases, barrel exports, overloaded and
generic functions, components, custom hooks, contexts, React Router, Fetch,
Axios, generated clients, and ambiguous or dynamic URLs.

### Full-Stack Fixture

Must contain several similar routes and DTO names so matching cannot rely on a
basename. At least one feature must have a gold Route from a React component to a
specific database table, and another must intentionally remain ambiguous.

### Documentation Fixture

Must include a README, architecture guide, ADR, runbook, API document, database
design document, release note, and superseded section. It must contain explicit
links, qualified symbols, ambiguous short names, stale signatures, broken links,
and ordinary prose mentions that must not appear in code usage queries.

## Correctness Metrics

- Entity precision and recall by kind.
- Relation precision and recall by relation and analyzer.
- Exact-target resolution rate.
- Ambiguous and unresolved target accuracy.
- Duplicate canonical entity count.
- Missing or incorrect evidence ranges.
- Stale entities and relations after edits, renames, moves, and deletions.
- Database schema agreement against hand-authored expected objects.
- Cross-stack Route exact match and false-positive rate.
- Documentation link precision and recall by relation and resolution method.
- Documentation freshness, broken-link, and supersession classification.
- Zero documentation entities returned by code-only usage queries.

Compiler and framework facts should target at least 0.98 precision on owned
fixtures before the relevant phase exits. Recall targets are set per relation
because calls, dynamic dispatch, embedded SQL, and React routing have different
static limits.

## Retrieval Metrics

Each benchmark question has a gold set of required symbols, source ranges,
relations, and database objects.

- Recall of required entities within the Context Pack.
- Mean reciprocal rank of the first required entity.
- Unnecessary source tokens included.
- Context Pack token count and reduction versus a controlled repository-search
  baseline.
- Route coverage and evidence coverage.
- Answer key-fact coverage using a fixed agent, model, tool permissions, and turn
  budget.
- Documentation section recall and irrelevant prose tokens for dedicated
  documentation questions.
- Code and documentation token counts measured separately when both are requested.

Token reduction is measured from actual emitted Context Packs. It must not be
estimated from node count or assumed words per entity.

Initial target: at least 0.90 recall of gold entities within an 8,000-token pack
on owned architectural questions. This target should be revised only with a
recorded benchmark result and rationale.

## Performance Metrics

Initial engineering targets on a representative 250,000-line workspace:

- Symbol search p95 under 100 ms after indexing.
- Bounded neighborhood or Route query p95 under 300 ms.
- Context Pack construction p95 under 750 ms, excluding first-time indexing.
- Leaf-file incremental update visible within 2 seconds p95.
- No synchronous extension-host task over 50 ms attributable to analysis.

Cold index time, peak Cartographer memory, and database size are recorded from
the first implementation baseline before hard limits are chosen.

## Competitor Comparison

Graphify and SYNAPSE may be run from the ignored `Competition/` directory against
the same fixtures and question set. Comparison records outputs, accuracy,
latency, and context size. Their code, schemas, generated artifacts, and fixtures
are not copied into Kraken Atlas.

The primary comparison is semantic correctness and useful context per token, not
the number of supported languages or the visual node count.

## Regression Policy

- Every confirmed indexing bug gets the smallest fixture that reproduces it.
- Analyzer snapshots are review aids, not the sole assertion; tests also query
  canonical entities, relations, and evidence.
- Performance baselines run separately from deterministic correctness tests.
- Schema migrations are tested from every released Atlas schema version.
