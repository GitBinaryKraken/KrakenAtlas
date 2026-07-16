# Health and Non-Git Field Feedback

Date: 2026-07-16

Release response: 0.9.5

## Purpose

This note records an independent agent review of Kraken Atlas 0.9.4 against the
local Kelp test workspace. The tester told the agent in advance that the folder
was not a Git repository. The report is product evidence; no Kelp source or
generated Atlas is distributed with the extension.

## Reported Strengths

The agent found Atlas connected and useful. Orientation exposed .NET and npm
projects, commands, framework facets, database and migration hints, and the
governing `AGENTS.md`. Search and graph queries returned file-and-line evidence
for controllers, endpoint routes, database objects, and EF operations. The
static route match between `GET /Alive` in `KelpApi` and `GET /alive` in
`KelpApiConnector` was specifically useful.

## Reported Friction

1. `project_git_changes` returned `atlasState: no_repository` without crashing,
   but the installed instructions still told the agent to call it before every
   rebuild. In a known non-Git folder this was repeated ritual rather than useful
   work.
2. The managed Codex descriptor contained absolute extension, workspace, and VS
   Code workspace-storage paths. Those are correct for a local stdio process but
   are not portable across extension upgrades, folder moves, profiles, or
   machines unless Atlas refreshes them.
3. `prepare_change` interpreted an install-review prompt as symbol vocabulary
   and proposed unrelated application objects. A code-change Context Pack is the
   wrong diagnostic for an Atlas install or workspace-health task.
4. Orientation correctly reported partial coverage, including pending CI
   workflows, VS Code tasks, executable entry points, conditional source
   inclusion, and prose instruction bodies.
5. The agent reported 2 solutions, 11 projects, 673 files, 6,740 entities,
   16,765 relations, and 10 project dependencies. Those counts matched an older
   generation, revealing that the installed Cartographer could treat data from a
   previous analyzer release as current.

## Engineering Diagnosis

The analyzer cache already had version isolation, but release changes did not
advance a canonical analyzer version. Workspace discovery also used an older
independent version and did not include its algorithm version in the source
fingerprint. Summary and orientation exposed neither compatibility nor a rebuild
requirement, so an agent with an existing SQLite generation had no reliable
signal to reindex after upgrading the VSIX.

The remaining friction was workflow policy rather than a Git failure: the MCP
surface could report `no_repository`, but there was no single health query that
made this a durable session fact or distinguished diagnostic work from code
change preparation.

## 0.9.5 Response

- Add one release-aligned analyzer version source for workspace discovery and
  Roslyn; include discovery version in the source fingerprint and cache key.
- Mark health, summary, orientation, and foundation state `requires_rebuild`
  when indexed analyzer versions differ from the installed Cartographer.
- Add `get_atlas_health` through MCP, JSON-RPC, CLI, VS Code, and diagnostic
  export. It reports build requirement, source freshness, analyzer compatibility,
  Git applicability, connection portability, coverage, reasons, and actions.
- Make agent instructions health-first. Skip `project_git_changes` when health
  reports `no_repository`, and use `prepare_change` only for concrete coding
  tasks.
- Refresh existing Atlas-managed instruction blocks and direct Codex/Claude
  connection entries on trusted extension activation. Preserve all content
  outside Atlas markers.
- Keep path-bound descriptors explicit. They are a local-process requirement,
  not a portable repository contract; an already-running agent may still need a
  restart after refresh.

## Acceptance Result

A controlled 0.9.5 run opened a pre-upgrade Kelp Atlas with workspace-discovery
`1.1.0` and Roslyn `0.9.0`. Before rebuilding, health returned:

- `atlasState: requires_rebuild` and `buildRequired: true`;
- `sourceState: changed`;
- expected analyzer version `0.9.5` with both indexed versions named;
- `git.status: no_repository` with explicit skip guidance; and
- partial coverage with the pending source list.

Summary also returned `requires_rebuild`. The next build reanalyzed all eight C#
projects into one complete generation. Afterward, health returned `current`,
`buildRequired: false`, `sourceState: current`, and both analyzer versions at
`0.9.5`, while retaining the non-Git and partial-coverage guidance.

## Remaining Work

The missing orientation sources remain real roadmap items rather than health
bugs. Generic MCP clients still require their own configuration adapter, and a
client that reads a path-bound descriptor before trusted activation completes
must be restarted or set up again. Future diagnostics can add launch probes for
specific third-party MCP hosts without coupling Cartographer to one agent.
