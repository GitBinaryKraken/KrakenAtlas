# Getting Started

Kraken Atlas `0.9.6` is the Agent Guidance Alpha of the complete rewrite. It
discovers .NET solutions, C# and
package.json projects, project references, relevant files, project roles, build
dimensions, commands, and governing rules, then stores and queries that
structural map from a versioned SQLite Atlas. The first semantic slice also
indexes compiler-bound C# declarations, signatures, exact source locations,
internal calls, construction, member access, type use, inheritance,
implementations, and overrides. It also maps common DI registrations,
attribute-routed controllers, grouped Minimal APIs, middleware order, endpoint
contracts and policies, outbound HTTP requests, Dapper operations, and static EF
Core contexts, model objects, data operations, and migrations into bounded
cross-domain Routes.
It can project a bounded change surface from any exact entity, including direct
and transitive dependencies, affected projects, related attributed tests, and
focused build/test commands.
The first prepared-change workflow fits ranked static context and reusable
accepted assessments into an explicit token budget. Agents can record typed,
evidence-backed knowledge through the versioned node-decoration JSON contract;
claims remain separate from canonical facts and become stale when captured
dependencies change.
Repeated builds now return the current generation without running Roslyn when
workspace content is unchanged. A changed build reanalyzes changed C# projects
and their transitive project dependents, reuses compressed per-project semantic
facts for unaffected projects, and still commits one complete Atlas generation.
Working-tree and commit-range Git projection maps changed files onto current
symbols, graph impact, tests, projects, commands, and durable assessments at
risk before the next rebuild.
The extension also registers an agent-neutral local MCP server for the active workspace. Its
task-first `prepare_change` tool can resolve a likely seed or return explicit
candidate stable keys, then emit bounded source excerpts inside the pack budget.
An opt-in setup command installs both the appropriate managed instruction file
and, when the selected agent does not consume VS Code's native MCP provider, a
client connection adapter. Direct adapters are included for Codex and Claude;
other MCP-capable agents can use the generic copied stdio configuration.
The health query tells both users and agents whether a build is required,
whether indexed analyzer versions match the installed extension, whether source
inputs changed, whether Git projection applies, and which coverage remains
partial.

## Requirements

- VS Code 1.105 or newer.
- Node.js and npm for extension development.
- .NET 10 runtime for the current development VSIX.
- .NET 10 SDK for building the Cartographer.

Self-contained, platform-specific VSIX packaging is scheduled for product
hardening; the current development package launches the installed `dotnet`
runtime. Kraken Atlas checks for `Microsoft.NETCore.App` 10 before launching
Cartographer and provides an installation link when the runtime is unavailable.

## Build and Test

```powershell
npm install
npm test
```

## Package a VSIX

```powershell
npm run check:vsix
```

## Try the Extension

1. Open the repository in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run `Kraken Atlas: Show Health`, then build when it reports `buildRequired`.
4. Run `Kraken Atlas: Build Atlas` when required.
5. Run `Kraken Atlas: Show Atlas Summary` and inspect the discovered projects.
6. Run `Kraken Atlas: Show Workspace Orientation` and inspect project roles,
   build dimensions, commands, and governing rules.
7. Run `Kraken Atlas: Lookup Entity` with a project, facet, command, rule, or
   build-dimension stable key or numeric ID.
8. Run `Kraken Atlas: Search C# Symbols` with a type or member name and inspect
   the exact qualified names, signatures, projects, and definition locations.
9. Copy a returned C# symbol stable key and run `Kraken Atlas: Find C# Usages`
   to inspect exact incoming code relations and evidence spans.
10. Run `Kraken Atlas: Search Entities` for an endpoint route, service
   registration, or database table and keep the returned stable keys.
11. Run `Kraken Atlas: Show Relations` for one result and choose an incoming,
    outgoing, or bidirectional view.
12. Run `Kraken Atlas: Trace Route` with source and target stable keys. Supply
    comma-separated waypoint stable keys when several valid feature branches
    reach the same target.
13. Run `Kraken Atlas: Show Change Surface` with a method, endpoint, contract,
    or database-object stable key. Inspect dependency direction, related tests,
    affected projects, and verification commands.
14. Run `Kraken Atlas: Prepare Change Context Pack` for the same entity and a
    concrete task. Confirm the estimated output respects the selected budget.
15. Run `Kraken Atlas: Apply Node Decorations from JSON` with a schema-valid
    batch. Review the dry-run result before confirming the atomic write.
16. Run `Kraken Atlas: Show Node Assessments` and verify status, freshness,
    author, confidence, evidence, and claim identity.
17. Run `Kraken Atlas: Restart Cartographer`, then show the assessments again.
18. Run `Kraken Atlas: Export Diagnostics` and review the source-free health JSON.
19. Run `Kraken Atlas: Open Architecture Plan` to inspect the implementation
   roadmap.
20. Run `Kraken Atlas: Set Up AI Agent`, select the agent actually used in this
    workspace, and review the managed instruction and connection files. Existing
    content outside Atlas-owned entries must remain unchanged.
21. Run `Kraken Atlas: Show Agent Connection`. It should report setup pending
    until the selected client completes an Atlas health call.
22. Reload VS Code or restart the selected agent when prompted. For an
    unsupported client, paste the copied generic configuration into that
    client's MCP settings first.
23. Open the agent, enable or trust the `Kraken Atlas` MCP tools when prompted,
    and ask it to check Atlas health. Confirm `get_atlas_health` is selected,
    followed by a build when required and `get_workspace_orientation`.
24. Run `Kraken Atlas: Show Agent Connection` again. It should report
    `connected_current`; the private pending marker should be gone while the
    compact repository instruction block remains.
25. Ask the agent to prepare a concrete code change. Confirm `prepare_change`
    returns either a bounded Context Pack or `needs_seed` with ranked exact
    identities, selection reasons, and executable `nextActions`. A retry using
    the returned numeric ID should resolve exactly.

The Atlas database is stored under the VS Code workspace storage directory and
is not written into the source repository.

See [the invited-alpha test pass](ALPHA_TESTING.md) and
[privacy, storage, and telemetry behavior](PRIVACY.md). This build is
`UNLICENSED` and provided only for invited evaluation.
