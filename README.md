# Kraken Atlas

Version `0.6.0`

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

The `0.6.0` Change Surface Alpha builds on the Walking Cartographer foundation. It
contains:

- A thin VS Code workspace extension and matching command-line surface.
- An out-of-process .NET 10 Cartographer process using JSON-RPC 2.0.
- Deterministic discovery of .NET solutions, C# projects, package.json projects,
  project references, and relevant workspace files.
- Queryable workspace orientation with multi-valued project roles, target and
  build dimensions, executable .NET and package-script commands, structured
  repository conventions, governing instruction references, and explicit
  included/pending source coverage.
- A versioned SQLite Atlas with WAL, atomic generations, stable entity IDs,
  canonical containment and project-reference relations, and source evidence.
- Compiler-bound Roslyn declarations for namespaces, types, methods, properties,
  fields, events, overloads, partial types, visibility, generated/manual source,
  exact definition spans, and stable symbol identities.
- Exact internal C# calls, construction, field/property/event reads and writes,
  type use, inheritance, interface implementation, member implementation, and
  override relations with dispatch classification and source evidence.
- Atlas summary, exact entity, bounded C# symbol search, and code-only usage
  queries through VS Code, JSON-RPC, and CLI.
- Cross-domain entity search for symbols, service registrations, HTTP endpoints,
  outbound requests, database operations, and database objects.
- Attribute-routed ASP.NET Core controller endpoints with HTTP method, effective
  route template, authorization classification, handler, and source evidence.
- Common .NET dependency-injection registrations with lifetime, service,
  implementation, and exact interface-member dispatch edges.
- Statically recoverable `HttpClient` requests matched to compatible controller
  endpoints, including request and response-contract relations.
- Dapper SQL operations mapped to normalized PostgreSQL objects without storing
  SQL bodies as query results.
- Bounded directional relation queries and forward Routes across code,
  framework, and database domains, with ordered waypoints and evidence on every
  hop.
- Bounded change-surface queries that separate direct and transitive graph
  neighbors, dependency and dependent directions, affected projects, related
  test cases, and focused build/test commands.
- Canonical xUnit, NUnit, and MSTest `test_case` entities derived from test
  attributes, with exact source and owning-project evidence.
- Cross-process tests proving persistence, stable identity, and rollback to the
  previous generation after failed discovery.

The Change Surface Alpha covers a deliberately bounded static subset. Minimal
APIs, middleware ordering, EF Core models and migrations, dynamic URLs, runtime
dispatch, TypeScript/React semantics, agent tools, Context Packs, and external
package symbols remain planned.

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
- `Kraken Atlas: Restart Cartographer`
- `Kraken Atlas: Export Diagnostics`
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
```

AI agents should follow [the bounded query guide](docs/planning/AGENT_QUERY_GUIDE.md)
instead of opening or reverse-engineering the SQLite schema directly.

## Planning

Start with [the planning index](docs/planning/README.md). The implementation is
gated by the phase exits and benchmark requirements in that planning set.
