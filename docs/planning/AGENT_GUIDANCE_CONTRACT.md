# Agent Guidance Contract

## Purpose

Kraken Atlas must be useful to any MCP-capable coding agent without requiring
the user to explain Atlas on every task. Discovery uses progressive disclosure:
a small permanent repository instruction teaches the agent when to use Atlas,
while MCP tool descriptions and results provide the detailed next step.

The permanent instruction is intentionally short. It remains after a successful
connection because future agent sessions still need to know that Atlas exists,
how to check it, and how to recover from an unavailable connection.

## Durable Bootstrap

`Kraken Atlas: Set Up AI Agent` installs or refreshes one Atlas-owned block in
the selected client's normal repository instruction file. The block tells an
agent to:

- Start a coding task with `get_atlas_health`, build only when required, then
  request `get_workspace_orientation`.
- Skip Git projection when health reports `no_repository`.
- Use `prepare_change` for a concrete edit and follow its returned
  `nextActions` when seed resolution is ambiguous.
- Use `search_code` with `kinds` for narrow discovery, then query relations by
  numeric entity ID or the complete stable key.
- Never query or reverse-engineer the SQLite database directly.
- Report a missing MCP connection instead of pretending that instructions make
  the tools available.

Only the delimited Atlas block is extension-owned. User and team instructions
outside it are preserved.

## Suggested Workflows

### Begin A Coding Task

1. Call `get_atlas_health`.
2. Call `build_atlas` only when `buildRequired` is true.
3. Call `get_workspace_orientation` once for repository shape and commands.
4. Call `project_git_changes` before rebuilding only when health reports a Git
   repository and live changes matter.
5. Call `prepare_change` with the concrete task and the best known symbol,
   route, or project hint.

### Resolve An Ambiguous Seed

1. Read the ranked candidates and their `selectionReason` values.
2. Choose the candidate supported by the task and evidence.
3. Invoke its returned `nextActions` entry unchanged, or retry
   `prepare_change` with that candidate's numeric entity ID.
4. Never shorten, copy partially, or reconstruct a stable key.

### Investigate A Narrow Question

1. Call `search_code` with a focused query and `kinds` when the domain is known.
2. Use the returned numeric ID for `get_relations`; the full stable key is also
   accepted as the canonical portable identity.
3. Call `trace_route` only when the question requires an execution or dependency
   path across several nodes.

## Identity And Recovery

Stable keys are canonical identities and must be treated as opaque complete
values. Numeric entity IDs are generation-local but are the preferred exact
follow-up inside one current Atlas generation. Search and task resolution return
rank, selection rationale, and executable `nextActions` so an agent does not
have to invent recovery arguments.

`entity_not_found` for a shortened key is an expected contract failure. The
agent should return to the originating result and use its numeric ID or complete
stable key.

## Private Setup State

Setup writes a temporary `agent-setup.pending.json` marker under private VS Code
workspace storage, never into the repository. The local MCP server writes one
source-free connection receipt per client under `agent-connections` as the
client initializes, lists tools, and successfully calls `get_atlas_health`.

A successful health call deletes the pending marker immediately. The permanent
repository bootstrap remains. `Kraken Atlas: Show Agent Connection` summarizes
these states:

- `connected_current`
- `connected_old_version`
- `tools_discovered`
- `initialized`
- `path_changed`
- `configured_not_verified`
- `not_verified`

Receipts contain client/server versions, protocol version, workspace and Atlas
paths, and milestone timestamps. They contain no source bodies, prompts, tool
arguments, or tool results.

## Ownership And Failure Rules

- The extension owns only explicit managed instruction/configuration entries
  and private setup state.
- Cartographer may write private receipts and remove the private pending marker;
  it never edits repository instructions or client configuration.
- Agents consume guidance. They do not delete their own instructions or repair
  Atlas-managed configuration.
- Receipt persistence is diagnostic. A write or cleanup failure is logged and
  must not fail an otherwise successful MCP tool call.
- A verified connection removes temporary setup guidance, not the durable
  bootstrap needed by future sessions.
