# Next Steps: .NET Relationship Verification

The roadmap is organized around code structures, not product features. Each row is complete only when a fixture proves the expected symbols, semantic references, relationships, locations, confidence/provenance, negative cases, and clean-versus-incremental parity.

## Verified Baseline

- SDK-style C# projects loaded through Roslyn `MSBuildWorkspace`
- cross-project `ProjectReference` symbol resolution
- file-scoped namespaces
- records
- interface implementation through `IMPLEMENTS`
- primary-constructor dependency injection through `INJECTS`
- built-in DI registration through `REGISTERS`
- Minimal API route mapping through `MAPS_ROUTE`
- semantic method calls through `CALLS` and reference records
- loose-file fallback when no project or solution is loadable

## Priority Matrix

| Priority | Structure | Required proof |
| --- | --- | --- |
| P0 | `.sln` and `.slnx` with multiple projects | Correct project boundaries, cross-project IDs, references, and no duplicate documents. |
| P0 | C# identity stress cases | Overloads, generics, extension methods, nested types, explicit interface methods, records, and primary constructors remain distinct. |
| P0 | ASP.NET Core controllers | Controller/action symbols, composed routes, verbs, authorization, model types, calls, and source locations. |
| P0 | Minimal APIs | Route groups, mapped verbs, lambda/method handlers, injected parameters, authorization, and handler calls. |
| P0 | Dependency injection | Constructor and primary-constructor injection, common registration forms, interface-to-implementation links, and lifetimes where provable. |
| P1 | Razor Pages and MVC views | Page/handler/model/view relationships and route entry points without speculative edges. |
| P1 | Blazor | Components, routes, parameters, injected services, and component composition. |
| P1 | EF Core | `DbContext`, `DbSet`, entity configuration, queries, writes, and repository/service callers. |
| P1 | MediatR and CQRS | Request-to-handler and caller-to-send relationships with generic type resolution. |
| P1 | Options and configuration | Binding, options injection, and configuration-key use across projects. |
| P1 | Partial and generated code | Stable symbol identity across files; generated provenance is visible. |
| P1 | Broken or incomplete builds | Useful fallback output, explicit analyzer diagnostics, and no false semantic certainty. |
| P2 | Large real repositories | Query latency, index size, deterministic IDs, and sampled relationship precision. |

## Test Discipline

1. Add one minimal fixture for each distinct language or framework structure.
2. Assert exact symbol IDs only where identity stability is part of the contract.
3. Assert both incoming and outgoing graph navigation.
4. Include one plausible non-edge to catch overmatching.
5. Verify source paths and line ranges.
6. Compare clean build and incremental update output.
7. Add a real-repository scenario after the focused fixture passes.

## Query And Storage Work

- Keep CLI, VS Code, language-model tools, context packs, and generated agent guidance aligned on the six direct query types.
- Surface analyzer load failures and fallback mode clearly in `project` and `doctor` output.
- Preserve resolved symbol identity and project ownership in SQLite without adding ranking heuristics.
- Measure direct query latency and result precision on multi-project repositories.
- Add schema migration tests whenever the map record contract changes.

## Deferred

Implementation recommendations, change planning, convention/pattern detection, architecture hotspots, code-health findings, drift, orphan review, and duplicate review remain archived on `july13th-offtrack`. Reconsider them only after the P0 matrix has measurable accuracy and real-repository validation.
