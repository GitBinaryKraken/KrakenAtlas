# AI Agent Query Guide

This guide describes the bounded query surface available in the Persona Route
Alpha. An agent should query Cartographer before recursively reading a workspace.
Stable keys returned by one query are the exact identities used by later
queries.

## Recommended Workflow

1. Run `summary` and `orientation` to learn workspace shape, project roles,
   dependencies, target frameworks, commands, and governing rules.
2. Run `search` to resolve code, framework, or database entities by name,
   qualified name, signature, route, or object name.
3. Run `entity` for exact identity, locations, and relation counts.
4. Run `usages` for incoming compiler-bound C# usages only.
5. Run `relations` for bounded incoming, outgoing, or bidirectional neighbors
   across the `code`, `framework`, and `database` domains.
6. Run `route` between exact entities. Add ordered `--via-key` values when the
   requested feature must pass through a particular contract or boundary.
7. Run `surface` before editing to retrieve direct/transitive neighbors, affected
   projects, attributed tests, and focused build/test commands.
8. Read only the files and spans returned as evidence, then request broader
   source context only when the map reports a gap or ambiguity.

## CLI Examples

All commands require at least one `--workspace` and one `--atlas` argument.

```powershell
# Resolve all Atlas entity kinds. Repeat --kind to restrict kinds.
cartographer search --query "GET /Persona" --kind http_endpoint --limit 25
cartographer search --query "public.personas" --kind database_object --limit 25

# Inspect one exact identity and its bounded graph neighborhood.
cartographer entity --stable-key http_endpoint:<hash>
cartographer relations --stable-key http_endpoint:<hash> --direction both --limit 50

# Trace one forward route. --via-key can be repeated and order is significant.
cartographer route --source-key csharp_symbol:<hash> `
  --via-key csharp_symbol:<connector-contract-hash> `
  --target-key database_object:<hash> --max-depth 16 --max-visited 5000

# Inspect a bounded change surface and its verification targets.
cartographer surface --stable-key csharp_symbol:<hash> `
  --max-depth 3 --max-entities 200
```

The examples abbreviate the executable. In a development checkout it is:

```text
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll
```

## JSON-RPC Methods

The out-of-process Cartographer exposes the same operations through
content-length framed JSON-RPC 2.0:

- `get_atlas_summary`: no query parameters.
- `get_workspace_orientation`: no query parameters.
- `get_entity`: `{ "stableKey": "..." }` or `{ "id": 42 }`.
- `search_symbols`: `{ "query": "PersonaService", "limit": 25 }`.
- `search_entities`: `{ "query": "public.personas", "kinds": ["database_object"], "limit": 25 }`.
- `find_usages`: `{ "stableKey": "...", "kinds": ["calls"], "limit": 50 }`.
- `get_relations`: `{ "stableKey": "...", "direction": "both", "domains": ["code", "framework", "database"], "kinds": [], "limit": 50 }`.
- `trace_route`: `{ "sourceStableKey": "...", "targetStableKey": "...", "viaStableKeys": ["..."], "domains": ["code", "framework", "database"], "maxDepth": 16, "maxVisited": 5000 }`.
- `get_change_surface`: `{ "stableKey": "...", "domains": ["code", "framework", "database"], "kinds": [], "maxDepth": 3, "maxEntities": 200 }`.

Omitted relation domains default to `code`, `framework`, and `database`.
Relation results are capped at 200. Routes are forward-only, capped at 16 hops
and 20,000 visited entities, exclude `contains` unless relation kinds are
explicitly requested, and return one shortest path through each waypoint.

Change surfaces are bidirectional and capped at depth 8 and 1,000 entities.
`dependency` means the prior entity depends on the returned entity;
`dependent` means the returned entity depends on the prior entity. By default,
high-fanout code `reads`, `writes`, and `uses_type` relations are included only
when directly attached to the seed and are not recursively expanded. Supplying
explicit relation `kinds` opts into traversal through those kinds.

## Interpreting Results

- Treat `stableKey` as canonical identity; do not join entities by basename.
- Use `domain`, `kind`, `dispatchKind`, and `logicalScope` together. For example,
  `framework/dispatches_to/di` with scope `scoped` is stronger than a compiler
  implementation relation for the active composition root.
- Every returned relation includes one exact evidence span. Open that span when
  verifying or changing the behavior.
- `graphTruncated: true` means the path result may be incomplete. Narrow domains,
  add waypoints, or raise bounds within the supported limits.
- `found: false` means no path exists inside the selected static graph and
  bounds. It does not prove that runtime reflection, dynamic URLs, configuration,
  or external services cannot connect the entities.
- Change-surface results are inspection and verification candidates. They do not
  claim an edit is mandatory without a proposed change type such as signature,
  contract, or deletion.

## Code Versus Documentation

`find_usages`, `get_relations`, and `trace_route` do not treat documentation as
code usage. The current `search_entities` method searches Atlas entity metadata,
not documentation bodies. Future documentation lookup will use a separate
`search_documentation`/`get_entity_documentation` surface so an agent can ask
for explanatory material without contaminating code-reference answers.

Do not query SQLite tables directly as an agent integration contract. Schema
migrations are internal; CLI and JSON-RPC contracts provide stable bounds,
generation handling, identity validation, and evidence shaping.
