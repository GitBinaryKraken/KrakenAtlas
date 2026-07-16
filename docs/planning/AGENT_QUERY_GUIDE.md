# AI Agent Query Guide

This guide describes the bounded query surface available in the Agent Discovery
Alpha. An agent should query Cartographer before recursively reading a workspace.
Stable keys returned by one query are the exact identities used by later
queries.

## Agent Discovery

The extension registers the Kraken Atlas MCP server automatically for agents
that consume VS Code's native MCP provider. Independent agent extensions can run
their own MCP host and therefore need a client adapter.

For durable repository-level discovery and connection, run `Kraken Atlas: Set
Up AI Agent`. Native VS Code/Copilot, Codex, Claude Code, and generic
MCP-compatible clients all receive the same Cartographer launch definition.
Only the client-specific serialization differs. The setup flow can install the
bounded workflow into `AGENTS.md`, `.github/copilot-instructions.md`, or
`CLAUDE.md`; it can also update `.codex/config.toml`, update `.mcp.json`, or copy
a generic `mcpServers` JSON object. Existing instructions and unrelated MCP
servers are preserved.
On trusted extension activation, Atlas refreshes any existing Atlas-managed
instruction blocks and direct Codex or Claude connection entries. These files
remain machine-local and path-bound; restart a client that loaded its
configuration before the refresh completed.

Instruction files and MCP connection files solve different problems. The first
teaches tool-use policy; the second exposes the tools. If an agent can read the
instructions but cannot list Kraken Atlas tools, its MCP client adapter is not
loaded and must be configured or restarted.

## Recommended Workflow

1. Run `health`. Build or rebuild when `buildRequired` is true. Treat its
   analyzer-version, source-state, Git, connection, and coverage fields as the
   authority for the rest of the workflow.
2. Run `summary` and `orientation` to learn workspace shape, project roles,
   dependencies, target frameworks, commands, and governing rules.
3. Run `search` to resolve code, framework, or database entities by name,
   qualified name, signature, route, or object name.
4. Run `entity` for exact identity, locations, and relation counts.
5. Run `usages` for incoming compiler-bound C# usages only.
6. Run `relations` for bounded incoming, outgoing, or bidirectional neighbors
   across the `code`, `framework`, and `database` domains.
7. Run `route` between exact entities. Add ordered `--via-key` values when the
   requested feature must pass through a particular contract or boundary.
8. Run `surface` before editing to retrieve direct/transitive neighbors, affected
   projects, attributed tests, and focused build/test commands.
9. When health reports `git.status: repository`, run `git-changes --mode
   working_tree` before rebuilding an edited workspace.
   This projects live changes onto current Atlas identities and identifies saved
   assessments whose evidence is at risk. Use range mode for branch or review
   comparisons. Skip this step when health reports `no_repository`.
10. Run `prepare-task` only for a concrete coding change, with a task and token
   budget. Do not use it for Atlas install, setup, or workspace-health reviews.
   Add `--query` when
   task vocabulary does not closely match a symbol. If resolution is
   `needs_seed`, repeat with one returned stable key.
11. Request `--include-source` only when the ranked identities and evidence spans
   are insufficient. Keep `--source-line-limit` small.
12. After learning a reusable noncanonical conclusion, submit a schema-valid
   `decorate-nodes --dry-run` batch, then apply it with the same operation ID.
13. Read only the files and spans returned as evidence, then request broader
   source context only when the map reports a gap or ambiguity.

## CLI Examples

All commands require at least one `--workspace` and one `--atlas` argument.

```powershell
# Check upgrade compatibility, source freshness, Git applicability, and coverage.
cartographer health

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

# Project current edits or a commit range through the last Atlas generation.
cartographer git-changes --mode working_tree --max-depth 2 --max-entities 100
cartographer git-changes --mode range --base-ref origin/main --target-ref HEAD

# Build a compact agent Context Pack for a concrete change.
cartographer prepare --stable-key csharp_symbol:<hash> `
  --task "Add audit logging to the Persona read" --token-budget 4000

# Begin from task vocabulary; include bounded code only after seed resolution.
cartographer prepare-task --task "Add audit logging to the Persona read" `
  --query PersonaService --token-budget 4000 --include-source `
  --source-line-limit 24

# Audit current and stale assessment history; normal queries return accepted,
# current claims only.
cartographer assessments --stable-key csharp_symbol:<hash> `
  --include-proposed --include-stale --include-history

# Validate and then atomically apply the versioned decoration JSON envelope.
cartographer decorate-nodes --input .\persona-assessments.json --dry-run
cartographer decorate-nodes --input .\persona-assessments.json
```

The examples abbreviate the executable. In a development checkout it is:

```text
dotnet cartographer/KrakenAtlas.Cartographer/bin/Release/net10.0/KrakenAtlas.Cartographer.dll
```

## JSON-RPC Methods

The out-of-process Cartographer exposes the same operations through
content-length framed JSON-RPC 2.0:

- `get_atlas_summary`: no query parameters.
- `get_atlas_health`: no query parameters.
- `get_workspace_orientation`: no query parameters.
- `get_entity`: `{ "stableKey": "..." }` or `{ "id": 42 }`.
- `search_symbols`: `{ "query": "PersonaService", "limit": 25 }`.
- `search_entities`: `{ "query": "public.personas", "kinds": ["database_object"], "limit": 25 }`.
- `find_usages`: `{ "stableKey": "...", "kinds": ["calls"], "limit": 50 }`.
- `get_relations`: `{ "stableKey": "...", "direction": "both", "domains": ["code", "framework", "database"], "kinds": [], "limit": 50 }`.
- `trace_route`: `{ "sourceStableKey": "...", "targetStableKey": "...", "viaStableKeys": ["..."], "domains": ["code", "framework", "database"], "maxDepth": 16, "maxVisited": 5000 }`.
- `get_change_surface`: `{ "stableKey": "...", "domains": ["code", "framework", "database"], "kinds": [], "maxDepth": 3, "maxEntities": 200 }`.
- `get_git_changes`: `{ "mode": "working_tree", "maxDepth": 2, "maxEntities": 100, "maxFiles": 100 }` or `{ "mode": "range", "baseRef": "origin/main", "targetRef": "HEAD" }`.
- `prepare_change`: `{ "task": "Add audit logging", "stableKey": "...", "tokenBudget": 4000, "maxDepth": 3, "includeProposed": false }`.
- `prepare_task`: `{ "task": "Add audit logging", "query": "PersonaService", "tokenBudget": 4000, "includeSource": true, "sourceLineLimit": 24, "candidateLimit": 8 }`.
- `get_entity_assessments`: `{ "stableKey": "...", "includeProposed": false, "includeStale": false, "includeHistory": false, "limit": 50 }`.
- `decorate_nodes`: the complete version 1.0 node-decoration batch object.

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

Prepared changes accept budgets from 800 through 32,000 estimated tokens. The
estimate is based on deterministic serialized JSON size and is not tied to one
model tokenizer. Source slices are optional for exact `prepare_change` requests
and default on for MCP task preparation. Each slice is line-bounded and the full
response remains inside the requested budget. `truncated`,
`sourceSlicesIncluded`, and omitted counts make budget loss explicit.

Normal prepared packs include accepted current assessments only. Proposed claims
require `includeProposed`; stale and historical claims are queried explicitly and
are never silently used as canonical facts. Decoration batches are pinned to the
active generation, use exact selectors, and should be dry-run before application.

Atlas builds report `indexing.mode` as `full`, `incremental`, or `unchanged`.
`unchanged` preserves the generation and skips Roslyn. `incremental` creates a
new complete generation after analyzing changed C# projects and transitive
project dependents and reusing unaffected project cache entries. Git projection
does not mutate the Atlas or run Git network operations. Run it before rebuilding
when assessment risk against live edits matters; after rebuilding, normal claim
freshness reports canonical staleness.

## MCP Tools

The VS Code extension registers a local `Kraken Atlas` MCP stdio server with the
active workspace roots and private Atlas path. The available tools are:

- `build_atlas`
- `get_atlas_health`
- `get_atlas_summary`
- `get_workspace_orientation`
- `search_code`
- `get_relations`
- `trace_route`
- `project_git_changes`
- `prepare_change`
- `get_assessments`
- `decorate_nodes`

Begin with health, build when `buildRequired` is true, then request orientation.
Project live Git changes before rebuilding only when health reports a repository,
and use `prepare_change` only for concrete code changes. It returns `resolution: auto` with a Context
Pack only when one seed is sufficiently distinct. `needs_seed` returns ranked
candidates and requires an exact follow-up. `no_match` means task vocabulary did
not resolve inside current mapped metadata; use `search_code` or source search.

Assessment reads and writes remain separate tools from structural map queries.
This prevents an agent-authored conclusion from being mistaken for a compiler or
framework fact and lets callers opt into proposed, stale, or historical claims.

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
