# Kraken Atlas

Version `0.9.4`

Kraken Atlas is being rebuilt from scratch as a local semantic code map for AI
coding agents. The published extension identity remains
`BinaryKraken.kraken-atlas`; the implementation that existed through version
`0.2.3` has been removed from the current development line.

The new product focuses on:

1. Modern .NET and ASP.NET Core projects written in C#.
2. Database objects and data access defined in application code.
3. TypeScript and React projects and their connections to .NET APIs.
4. Small, evidence-backed agent queries and Context Packs.
5. Separate code-usage and documentation-relationship queries.

## Current Status

The `0.9.4` Tactical Retrieval Alpha builds on the Agent Connection Alpha. It
contains:

- A thin VS Code workspace extension, matching command-line surface, and a
  bundled, agent-neutral MCP stdio server registered automatically with native
  VS Code agents for the active workspace.
- An opt-in AI agent setup flow for native VS Code agents, Codex, Claude Code,
  and other MCP-capable agents. It installs the appropriate repository
  instructions and client connection adapter without changing Cartographer's
  agent-neutral core.
- An out-of-process .NET 10 Cartographer process using JSON-RPC 2.0.
- Deterministic discovery of .NET solutions, C# projects, package.json projects,
  project references, and relevant workspace files.
- Queryable workspace orientation with multi-valued project roles, target and
  build dimensions, executable .NET and package-script commands, structured
  repository conventions, governing instruction references, and explicit
  included/pending source coverage.
- A versioned SQLite Atlas with WAL, atomic generations, stable entity IDs,
  canonical containment and project-reference relations, and source evidence.
- Content-fingerprint no-op builds and a compressed SQLite semantic cache that
  reanalyzes changed C# projects plus transitive project dependents while reusing
  unchanged project facts in a complete atomic generation.
- Compiler-bound Roslyn declarations for namespaces, types, methods, properties,
  fields, events, overloads, partial types, visibility, generated/manual source,
  exact definition spans, and stable symbol identities.
- Exact internal C# calls, construction, field/property/event reads and writes,
  type use, inheritance, interface implementation, member implementation, and
  override relations with dispatch classification and source evidence.
- Atlas summary, exact entity, bounded C# symbol search, and code-only usage
  queries through VS Code, JSON-RPC, and CLI.
- Multi-term, project-aware cross-domain entity search for symbols, startup
  framework calls, service registrations, HTTP endpoints and attributes,
  outbound requests, database operations, and database objects.
- Attribute-routed ASP.NET Core controller endpoints with HTTP method, effective
  route template, authorization classification, handler, and source evidence.
- Minimal API `MapGet`/`MapPost`/`MapPut`/`MapPatch`/`MapDelete` endpoints,
  including statically recoverable `MapGroup` prefixes, handlers, request and
  response contracts, authorization policies, and source evidence.
- Ordered ASP.NET Core middleware entities for common `Use*` calls and
  source-defined `UseMiddleware<T>` components.
- Queryable ASP.NET Core startup entities for common `builder.Services.Add*`,
  `app.Map*`, and `AddHostedService<T>` calls, connected to controller namespaces,
  endpoint methods, and hosted worker implementations.
- Common .NET dependency-injection registrations with lifetime, service,
  implementation, and exact interface-member dispatch edges.
- Statically recoverable `HttpClient` requests matched to compatible controller
  endpoints, including request and response-contract relations.
- Dapper SQL operations mapped to normalized PostgreSQL objects without storing
  SQL bodies as query results.
- Static EF Core contexts and declared sets, entity-to-table and property-to-
  column mappings, scalar nullability, primary keys, indexes, data operations,
  and migration operations derived from attributes and fluent configuration.
- Unified database-object identity when EF Core and embedded PostgreSQL/Dapper
  SQL reference the same qualified table.
- Bounded directional relation queries and forward Routes across code,
  framework, and database domains, with ordered waypoints and evidence on every
  hop.
- Bounded change-surface queries that separate direct and transitive graph
  neighbors, dependency and dependent directions, affected projects, related
  test cases, and focused build/test commands.
- Canonical xUnit, NUnit, and MSTest `test_case` entities derived from test
  attributes, with exact source and owning-project evidence.
- Task-first, token-budgeted Context Packs that resolve likely seed entities,
  use explicit project qualifiers and task concepts, report unresolved
  ambiguity instead of guessing, rank a representative direct and transitive
  change surface, include related tests and verification commands, reuse
  accepted assessments, and optionally return bounded code excerpts.
- Workspace discovery filters ordinary generated, package-cache, publish, test-
  result, and build-output directories, including suffixed `bin_*` and `obj_*`
  folders used by local development workflows.
- Ten MCP tools for Atlas build, summary, orientation, entity search, relation
  queries, Route tracing, Git change projection, task Context Packs, assessment
  reads, and durable node decoration. Read-only tools are explicitly annotated.
- Bounded Git working-tree and commit-range projection onto mapped files,
  symbols, dependent behavior, tests, projects, and verification commands,
  including pre-rebuild warnings for durable assessments whose file, entity, or
  relation dependencies are touched.
- A durable assessment ledger separate from canonical facts, with versioned
  analysis sessions, typed JSON updates, exact evidence, confidence, status,
  provenance, idempotent operation replay, and dependency-driven freshness.
- The version 1.0 `decorate_nodes` contract across CLI, JSON-RPC, MCP, and VS Code,
  including generation pinning, dry-run validation, atomic writes, role and
  feature membership, behavior, lifecycle, guidance, Landmarks, gaps, and review.
- Cross-process tests proving persistence, stable identity, and rollback to the
  previous generation after failed discovery.

The Agent Discovery Alpha retains a deliberately bounded static-analysis subset.
EF owned entities, relationships, generated snapshot interpretation, endpoint
and MVC filters, dynamic route/SQL construction, runtime dispatch,
TypeScript/React semantics, documentation indexing, external package symbols,
unsaved editor overlays, and file-level dependent rebinds remain planned.

## Commands

- `Kraken Atlas: Show Status`
- `Kraken Atlas: Build Atlas`
- `Kraken Atlas: Show Atlas Summary`
- `Kraken Atlas: Show Workspace Orientation`
- `Kraken Atlas: Lookup Entity`
- `Kraken Atlas: Search C# Symbols`
- `Kraken Atlas: Search Entities`
- `Kraken Atlas: Find C# Usages`
- `Kraken Atlas: Show Relations`
- `Kraken Atlas: Trace Route`
- `Kraken Atlas: Show Change Surface`
- `Kraken Atlas: Project Git Changes`
- `Kraken Atlas: Prepare Change Context Pack`
- `Kraken Atlas: Show Node Assessments`
- `Kraken Atlas: Apply Node Decorations from JSON`
- `Kraken Atlas: Restart Cartographer`
- `Kraken Atlas: Export Diagnostics`
- `Kraken Atlas: Set Up AI Agent`
- `Kraken Atlas: Copy Generic MCP Configuration`
- `Kraken Atlas: Open Architecture Plan`

The diagnostic export contains environment and Atlas metadata such as local
paths, versions, counts, timings, capabilities, and errors. It does not include
source file bodies or project and entity inventories. Review the JSON before
sharing it because local paths can still be sensitive.

## Development

```powershell
npm install
npm test
npm run check:vsix
```

The VSIX is written to the parent `pack-artifacts` directory.

Invited testers should follow [the alpha testing guide](ALPHA_TESTING.md). See
[privacy and local-data behavior](PRIVACY.md) before sharing diagnostics. The
project is currently `UNLICENSED`; invited evaluation does not grant
redistribution rights.

## Cartographer CLI

```powershell
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll build --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll summary --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll orientation --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll entity --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key project:<hash>
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll symbols --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --query PersonaService --limit 25
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll search --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --query "GET /Persona" --kind http_endpoint --limit 25
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll usages --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key csharp_symbol:<hash> --kind calls --limit 50
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll relations --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key http_endpoint:<hash> --direction both --limit 50
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll route --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --source-key csharp_symbol:<hash> --via-key csharp_symbol:<hash> --target-key database_object:<hash> --max-depth 16
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll surface --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key csharp_symbol:<hash> --max-depth 3 --max-entities 200
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll git-changes --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --mode working_tree --max-depth 2 --max-entities 100
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll git-changes --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --mode range --base-ref origin/main --target-ref HEAD
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll prepare --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key csharp_symbol:<hash> --task "Add audit logging" --token-budget 4000
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll prepare-task --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --task "Add audit logging to Persona reads" --query PersonaService --token-budget 4000 --include-source --source-line-limit 24
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll assessments --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --stable-key csharp_symbol:<hash> --include-proposed --include-stale
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll decorate-nodes --workspace E:\Projects\MyApp --atlas E:\Atlas\my-app.sqlite3 --input .\node-decorations.json --dry-run
```

AI agents should follow [the bounded query guide](docs/planning/AGENT_QUERY_GUIDE.md)
instead of opening or reverse-engineering the SQLite schema directly.

## Agent Discovery And Connection

Atlas uses one agent-neutral stdio MCP launch definition. Native VS Code agents,
including GitHub Copilot Chat, discover it through the extension provider. Some
agent extensions run a separate host and do not consume VS Code's provider, so
they require their own small connection adapter.

Run `Kraken Atlas: Set Up AI Agent` and select the active client:

- `VS Code Chat / GitHub Copilot` uses the automatic extension provider and
  installs `.github/copilot-instructions.md`.
- `Codex` installs `AGENTS.md` and a managed `.codex/config.toml` MCP entry.
- `Claude Code` installs `CLAUDE.md` and a managed `.mcp.json` MCP entry while
  preserving other JSON servers and settings.
- `Other MCP-capable agent` installs `AGENTS.md` and copies a generic
  `mcpServers` stdio configuration for the client's own settings UI or file.

`Kraken Atlas: Copy Generic MCP Configuration` is also available independently.
There is no universal VS Code API that injects MCP tools into every third-party
agent extension; the generic descriptor is the fallback for any MCP-compatible
client whose configuration Atlas does not yet adapt directly.

Setup is opt-in and supports multi-root workspaces. Instruction updates own only
the explicit Atlas HTML-comment block. Codex and Claude connection updates own
only their marked Atlas server entry and refresh it after extension upgrades.
Generated connection files contain local absolute paths and should be treated as
machine-local configuration unless a team deliberately replaces them with a
portable launcher. Restart the selected agent after its connection changes.

Instructions and connection are separate requirements: instruction files teach
the agent when and how to query Atlas, but only an active MCP connection exposes
the tools. The next Atlas build maps installed instruction files as governing
repository rules.

## MCP Agent Tools

VS Code 1.105 or newer discovers the bundled `Kraken Atlas` MCP server from the
extension. An agent should begin with `get_workspace_orientation`, call
`build_atlas` when the Atlas is absent, use `project_git_changes` before a
rebuild to understand live edits and assessment risk, then use `prepare_change`
for a concrete task. `prepare_change` can start with task text or a search hint;
if the seed is ambiguous it returns `needs_seed` and ranked stable-key
candidates.

MCP source excerpts are local, opt-in, code-file-only, line-bounded, and counted
inside the requested token budget. They are returned to the invoking client but
are not persisted in SQLite. Documentation remains a separate future query
dimension and is never mixed into code usages or Routes.

## Planning

Start with [the planning index](docs/planning/README.md). The implementation is
gated by the phase exits and benchmark requirements in that planning set.
