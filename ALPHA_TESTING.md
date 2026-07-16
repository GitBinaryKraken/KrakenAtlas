# Kraken Atlas Agent Tooling Beta Testing

## Purpose

This alpha validates the durable Cartographer foundation, complete static .NET
feature Routes, evidence-backed change surfaces, token-budgeted prepared-change
Context Packs, MCP agent tools, bounded source excerpts, and durable agent
assessments in real VS Code environments. It
is intentionally narrower than the planned product.

The preview currently discovers solutions, .NET and package.json projects,
project references, relevant workspace files, project roles, build dimensions,
supported commands, structured conventions, and governing instruction files. It
persists that structural map in SQLite and offers status, summary, orientation,
exact-entity, restart, and diagnostic commands. It also uses Roslyn to index C#
declarations, overload signatures, visibility, partial locations, and
generated/manual definition evidence, with a bounded symbol-search command.
It also records exact internal calls, construction, member reads and writes, type
use, inheritance, implementations, and overrides, and exposes a bounded,
code-only usage query. The framework slice maps common DI registrations,
attribute-routed controllers, Minimal APIs with static route-group prefixes,
endpoint contracts and policies, ordered middleware, statically recoverable
outbound HTTP requests, Dapper operations, and normalized PostgreSQL objects.
It also maps static EF Core contexts, declared sets, scalar columns, primary
keys, indexes, common data operations, and migration operations. General entity
search, directional relation queries, and bounded forward Routes expose these
facts through VS Code, JSON-RPC, and CLI.
It also returns bounded direct/transitive neighbors, dependency direction,
affected projects, attributed xUnit/NUnit/MSTest test cases, and focused build
or test commands for an exact seed entity.
The Agent Memory slice combines those facts with current accepted assessments
under an explicit output budget. A versioned JSON command records typed claims
in a separate SQLite enrichment plane with exact selectors, evidence,
provenance, confidence, idempotency, and dependency-based freshness.
The extension registers the same local Cartographer services through MCP. Agents
can begin with task text, receive explicit seed candidates when resolution is
ambiguous, and request code-only source excerpts inside a fixed token budget.

It does not yet provide full MVC/filter semantics, complete EF relationship or
snapshot interpretation, TypeScript/React semantics, predictive impact analysis,
incremental indexing, Git change projection, or documentation indexing. Please
evaluate the capabilities that exist rather than the planned semantic surface.

## Distribution and License Status

The preview package is `UNLICENSED` and all rights are reserved by BinaryKraken.
It is provided only to invited alpha testers for evaluation. The package is not
an open-source license grant and should not be redistributed. A formal license
must be selected before broader public distribution.

## Requirements

- VS Code 1.105 or newer on a desktop workspace.
- The .NET 10 runtime (`Microsoft.NETCore.App 10.x`) available through `dotnet`
  on `PATH`.
- A trusted local workspace. Virtual and untrusted workspaces are not supported.

Kraken Atlas checks the runtime before starting Cartographer. When .NET 10 is
missing, the extension reports the detected runtimes and links to the installer.

## Install

```powershell
code --install-extension .\kraken-atlas-<version>.vsix --force
```

In VS Code, run `Developer: Reload Window`, then open the workspace being tested.

## Suggested Test Pass

1. Run `Kraken Atlas: Show Status`.
2. Run `Kraken Atlas: Build Atlas` and record the duration and reported project
   and file counts.
3. Run `Kraken Atlas: Show Atlas Summary` and compare its project list with the
   solutions and projects you expect.
4. Run `Kraken Atlas: Show Workspace Orientation`. Compare its project roles,
   target frameworks, runtime identifiers, build/test/run commands, package
   scripts, and governing rules with the repository.
5. Copy a project or orientation stable key and run
   `Kraken Atlas: Lookup Entity`.
6. Run `Kraken Atlas: Search C# Symbols` for an overloaded method, a partial
   type, and a duplicate short name. Verify qualified names, signatures,
   projects, generated/manual status, and definition locations.
7. Copy a method or type stable key from symbol search and run
   `Kraken Atlas: Find C# Usages`. Check calls, implementation/override links,
   dispatch classification, source symbol, project, and evidence location.
8. Repeat with an interface method and verify both callers and concrete member
   implementations are returned without README or documentation mentions.
9. Run `Kraken Atlas: Search Entities` for a controller route, grouped Minimal
   API route, DI service, middleware, EF context, migration, and database table.
   Verify entity kinds, signatures, stable keys, and evidence.
10. Run `Kraken Atlas: Show Relations` on an endpoint and verify the outbound
    `handled_by` and incoming `matches_endpoint` edges.
11. Trace a Route from a UI/controller method to a database object. Add the
    intended interface method as a waypoint if another valid branch reaches the
    same target. Verify every hop has a file and source span.
12. Check that Routes include appropriate `calls`, `dispatches_to`, `sends_http`,
    `matches_endpoint`, `handled_by`, `executes_sql` or `executes_ef`, and
    database operation relations, without `contains` or documentation edges.
13. Run `Kraken Atlas: Show Change Surface` for a service method. Verify direct
    dependencies and dependents, bounded transitive results, affected projects,
    related attributed tests, evidence, and focused verification commands.
14. Repeat with a high-fanout DTO or database object. The response must respect
    depth/entity bounds and report truncation rather than flooding the output.
15. Run `Kraken Atlas: Prepare Change Context Pack` for the service method and a
    concrete task. Verify ranked evidence, reusable assessments, tests, commands,
    omitted counts, and `estimatedTokens <= tokenBudget`.
16. Apply a node-decoration batch first with `decorate-nodes --dry-run`, then
    without the flag. Repeat the same operation and verify status `replayed` with
    the same claim IDs.
17. Run `Kraken Atlas: Show Node Assessments`. Verify canonical facts are not
    presented as agent claims and each claim has status, freshness, confidence,
    agent identity, exact evidence, and a stable claim ID.
18. Change one evidenced source file, rebuild, and query with `--include-stale`.
    The dependent assessment must be stale and absent from normal prepared packs.
19. Run `Kraken Atlas: Restart Cartographer`, then show the summary again. The
   existing Atlas generation should reopen successfully.
20. Run `Kraken Atlas: Build Atlas` a second time. It should complete without DLL
   lock errors or stale Cartographer processes.
21. Close and reopen VS Code, then show the summary and assessments again.
22. Run `Kraken Atlas: Export Diagnostics`, review the JSON, and attach it to any
   issue where its local paths are acceptable to share.
23. In Agent mode, enable the `Kraken Atlas` tools and request workspace
    orientation. Verify the agent can discover all nine MCP tools.
24. Ask for a concrete feature change without supplying a stable key. Verify
    `prepare_change` returns either `auto`, `needs_seed` with ranked candidates,
    or `no_match`, never an unexplained fuzzy choice.
25. Repeat with an exact query or stable key, a 4,000-token budget, and source
    enabled. Verify all excerpts are code files, no excerpt exceeds its requested
    line limit, and `estimatedTokens <= tokenBudget`.

Kraken Atlas performs static discovery and does not execute the application,
instantiate EF Core contexts, run migrations, or connect to project databases.

## What to Report

Please include:

- Operating system and architecture.
- VS Code, Kraken Atlas, and installed .NET runtime versions.
- Workspace shape: solution count, project count, approximate file count, and
  whether it is a multi-root workspace.
- Missing or incorrect project roles, commands, build dimensions, and governing
  repository rules.
- Missing, duplicated, or incorrectly qualified C# declarations and signatures.
- Missing or incorrect C# relation targets, dispatch kinds, or evidence spans.
- Missing or incorrect controller/Minimal routes, route-group prefixes,
  authorization policies, middleware order, DI lifetimes, HTTP matches, EF
  mappings or operations, SQL operation kinds, or database object names.
- Routes that choose the wrong branch, omit a handoff, include structural edges,
  exceed their bounds, or lack source evidence.
- Change surfaces that omit proven direct neighbors, expand through unrelated
  shared types, misclassify dependency direction, miss attributed tests, or
  suggest irrelevant projects and commands.
- Prepared packs that exceed their token budget, omit the seed, fail to select a
  related test, mix stale claims into normal results, lose assessment labels,
  choose an ambiguous seed, or exceed source line bounds.
- Decoration batches that partially apply, accept fuzzy selectors, duplicate an
  idempotent operation, overwrite canonical facts, or fail to become stale after
  an evidenced file changes.
- Atlas counts and build duration.
- Expected projects that were missing or unexpected projects that appeared.
- The exact command that failed and the visible error.
- Whether restart, VS Code reload, and a second build succeeded.
- The exported diagnostic report after reviewing its paths.

Do not attach proprietary source files or database contents. MCP Context Packs
may contain requested source excerpts; the standard diagnostic export does not.

## Known Limitations

- Project kinds and language coverage are based on structural discovery.
- C# relations include only compiler-resolved targets declared inside the indexed
  workspace. External package symbols and unresolved/dynamic targets are omitted.
- Usage queries remain incoming and code-only. General relation queries and
  Routes are available, while impact analysis remains planned.
- Framework extraction covers attribute-routed controller actions, common
  Minimal API `Map*` calls and static `MapGroup` prefixes, declared endpoint
  contracts and policies, source-ordered middleware, common DI registrations,
  and statically recoverable HTTP requests. MVC filters, endpoint-filter
  behavior, convention routes, dynamically constructed routes, and runtime
  resolution are not yet mapped.
- EF Core extraction covers context and declared-set discovery, source entity
  scalar properties, table/column conventions and attributes, common fluent
  mappings, primary keys, indexes, common data operations, and migration
  operations. Owned entities, relationships, foreign-key semantics, many-to-
  many joins, string-based model snapshots, runtime conventions, and complete
  migration column reconstruction remain planned.
- Embedded SQL extraction remains bounded to recognized Dapper and migration
  calls with recoverable strings. ADO.NET, stored-procedure definitions,
  provider-specific SQL parsing, SQL bodies in query output, and dynamic SQL are
  not mapped.
- Route tracing is forward-only, shortest-path, bounded to 16 hops, and returns
  one route. Ordered stable-key waypoints disambiguate known feature branches.
- Change surfaces are static bidirectional graph projections, not predictions
  that every returned entity must be edited. Default traversal reports direct
  member reads/writes and type use but does not recursively expand through those
  high-fanout code relations. Explicit `--kind` filters override that profile.
- Test selection currently recognizes xUnit `Fact`/`Theory`, NUnit test
  attributes, and MSTest test-method attributes. Dynamic/custom test discovery
  and per-test runner filters remain planned.
- Prepared-change token counts are deterministic JSON-size estimates, not model-
  tokenizer counts. Requested source slices are restricted to recognized code
  files and included in that estimate; they are not persisted in SQLite.
- Assessment dependency capture is conservative: a change to an evidenced file
  can stale every claim depending on an entity in that file. Persisted Route
  evidence and explicit documentation fingerprints await their dedicated stores.
- Accepted requests below confidence `0.8` or without canonical evidence are
  stored as proposed and returned with an `accepted_downgraded` diagnostic.
- Symbol search matches name and qualified-name fragments and returns at most 100
  results.
- The VSIX is framework-dependent and requires an installed .NET 10 runtime.
- MCP is available through the extension provider; native VS Code language-model
  tools remain optional future work because they would duplicate the MCP surface.
- Workspace storage is local to the VS Code profile and workspace identity.

## Uninstall and Local Data

```powershell
code --uninstall-extension BinaryKraken.kraken-atlas
```

VS Code may retain extension workspace storage after uninstall. The diagnostic
report contains the exact `atlasPath`. Close VS Code before manually deleting
that SQLite file or its containing Kraken Atlas storage directory.

See [PRIVACY.md](PRIVACY.md) for the complete preview data-handling statement.
