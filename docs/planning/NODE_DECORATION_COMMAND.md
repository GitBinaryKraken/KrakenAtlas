# Node Decoration Command Contract

## Purpose

AI agents need one strict write contract for adding reusable assessments to Atlas
nodes. They must not generate SQL, edit the Atlas database directly, invent a
client-specific property bag, or overwrite facts produced by Roslyn, TypeScript,
configuration, database, or documentation analyzers.

The authoritative version 1.0 payload is the Draft 2020-12 JSON Schema at
[`contracts/node-decoration-batch.schema.json`](contracts/node-decoration-batch.schema.json).
An illustrative payload is checked in at
[`contracts/node-decoration-batch.example.json`](contracts/node-decoration-batch.example.json).

Version 0.8 exposes this Phase 2 contract through CLI, JSON-RPC, the
trusted-workspace VS Code adapter, and MCP over the same operation.

## One Operation, Multiple Adapters

All adapters invoke the same Cartographer application operation:

- CLI: `kraken-atlas decorate-nodes --workspace <root> --input <file|->`
- JSON-RPC: `decorate_nodes`, with the schema object as `params`
- MCP: `decorate_nodes(payload)`
- Internal VS Code API: `decorateNodes(payload)`

The current implementation supports every version 1.0 update intent. Entity,
relation, source-location, documentation-path, prior-claim, and manual evidence
are accepted. Persisted Route evidence and explicit documentation-fingerprint
dependencies remain disabled until those dedicated stores exist.

The CLI supports `--dry-run`. A dash for `--input -` reads one JSON object from
standard input, which allows an agent to pipe a generated payload without
creating a temporary file. The tool returns JSON on standard output and
diagnostics on standard error.

Example:

```powershell
kraken-atlas decorate-nodes `
  --workspace E:\Projects\CustomerPlatform `
  --input .\customer-search-assessment.json `
  --dry-run
```

After a successful dry run, the same command without `--dry-run` applies the
batch. Agents should prefer the dry-run-first workflow for generated payloads.

## Envelope

Every batch contains:

- `$schema` and `schemaVersion` so producers and consumers agree on the exact
  contract.
- `operationId`, an agent-supplied idempotency key.
- `workspace.workspaceKey` and `expectedAtlasGeneration`.
- Session identity, agent metadata, purpose, task fingerprint, and analysis
  scope.
- Transaction options.
- One or more node decorations.

`expectedAtlasGeneration` is mandatory. Cartographer rejects the entire batch if
the active generation changed after the agent read the map. The agent must query
the new generation, review the affected evidence, and submit a new operation.

## Node Selectors

A subject, target, or entity evidence item selects exactly one node by either:

- `stableKey`, preferred because it survives Atlas generations; or
- `entityId`, allowed only with the batch's exact expected generation.

`expectedKind` and `expectedQualifiedName` are optional guards. When supplied,
Cartographer rejects a selector whose resolved node does not match both guards.
No fuzzy name lookup is permitted in a write operation. An unresolved or
ambiguous selector is an error.

## Decorations

Each decoration has:

- A `clientUpdateId` unique within the analysis session.
- An exact `subject` node.
- One discriminated, schema-validated `update` intent.
- A concise human-readable `statement` explaining the conclusion.
- Confidence from `0` through `1`.
- A requested status of `proposed` or `accepted`.
- Applicable build or runtime conditions.
- Evidence and a dependency policy.
- Optional supersession links and tags.

The command may downgrade `requestedStatus: accepted` to `proposed` when policy,
evidence, confidence, or author permissions do not permit automatic acceptance.
It never upgrades a proposed claim without an explicit policy action.

Version 1.0 supports distinct intents for role classification, feature/pattern
membership, assessed relations, behavior, effects, contracts, failures,
lifecycle, change guidance, tests, documentation, Landmarks, precedents, dynamic
target resolution, design intent, local constraints, aliases, knowledge gaps,
and assessment review. Each intent permits only its own fields. Cartographer
derives internal dimensions and claim kinds so an agent cannot label a failure
payload as a documentation claim.

`add_membership` may create or reuse an assessment-owned group node for a
feature, pattern, Blueprint, subsystem, bounded context, workflow, architectural
boundary, business capability, or cross-cutting concern. It never creates a
compiler-owned code node. See
[AI Self-Enrichment](AI_SELF_ENRICHMENT.md) for the complete intent and
autonomous-recording policy.

## Evidence and Freshness

Every decoration requires at least one evidence item. Version 1.0 supports exact
entity, relation, source-location, documentation, Route, prior-claim, and manual
evidence.

`dependencyPolicy: capture_from_evidence` is the normal agent mode. Cartographer
resolves each evidence item and records current entity generations, relation
versions, file hashes, document fingerprints, and analyzer versions itself.
This avoids asking an agent to reproduce map internals it has just queried.

`dependencyPolicy: explicit` is available to trusted integrations. It requires
at least one typed dependency with its expected generation, hash, fingerprint,
or analyzer version.

When any captured dependency changes, the claim becomes stale. A later agent can
supersede or revalidate it, but the original claim and session remain auditable.

## Validation and Transaction Semantics

Processing order is fixed:

1. Parse with bounded input size and validate against the declared schema.
2. Check the operation idempotency key.
3. Resolve the workspace and compare the active Atlas generation.
4. Resolve every subject, target, evidence item, and prior claim exactly.
5. Validate update vocabulary, evidence policy, status policy, and conflicts.
6. Capture freshness dependencies from the active snapshot.
7. Create or resume the analysis session and write claims in one transaction.
8. Complete the session when `completeSession` is true.
9. Return resolved IDs, resulting statuses, dependency counts, and diagnostics.

`atomic` defaults to true and is the required mode for general-purpose AI
agents. Any invalid decoration rejects the batch and writes nothing. Partial
writes are reserved for trusted bulk-import tooling.

Repeating a completed `operationId` with byte-equivalent normalized input returns
the original result. Reusing it with different input is rejected. Repeating the
same `clientUpdateId` within a session is similarly idempotent when its normalized
update is unchanged.

## Response

The operation returns a JSON object shaped like:

```json
{
  "schemaVersion": "1.0",
  "operationId": "feature-customer-search-2026-07-15-01",
  "workspaceKey": "workspace:...",
  "atlasGeneration": 42,
  "sessionId": "session:...",
  "status": "applied",
  "results": [
    {
      "clientUpdateId": "join-customer-search-pattern",
      "updateKind": "add_membership",
      "subjectEntityId": 318,
      "status": "proposed",
      "claimIds": ["claim:..."],
      "groupKey": "pattern:vertical-slice:customer-search",
      "evidenceCount": 1,
      "dependencyCount": 5
    }
  ],
  "diagnostics": []
}
```

Batch status is `validated`, `applied`, `replayed`, or `rejected`. Diagnostics
contain stable codes and JSON Pointer paths so an agent can repair only the
invalid fields.

## Content Boundaries

The format stores conclusions, typed update payloads, evidence references, and
freshness inputs. It does not accept raw prompts, private reasoning,
chain-of-thought, unbounded transcripts, full source bodies, arbitrary SQL, or
canonical fact mutations. The validator rejects reserved reasoning/body keys and
the command enforces nested-key, payload-size, string-size, and collection-size
limits.

Documentation evidence remains explicitly typed as documentation. Adding it to a
node does not cause ordinary code-usage queries to return prose matches.
