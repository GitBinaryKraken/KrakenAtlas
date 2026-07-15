# AI Self-Enrichment Model

## Goal

Kraken Atlas should become more useful after each serious agent analysis. An
agent that discovers a feature boundary, architectural role, dynamic target,
failure path, or safe editing rule should be able to record that conclusion once
and let later agents query it without repeating the investigation.

Self-enrichment does not mean an agent can rewrite the semantic map. Roslyn,
TypeScript, project/configuration analyzers, database analyzers, and documentation
indexers remain authoritative for reproducible facts. Agent updates occupy an
assessment plane with provenance, evidence, confidence, scope, freshness, and
conflict state.

## Typed Update Intents

The `decorate_nodes` command accepts explicit update intents. Cartographer maps
each intent to controlled dimensions and typed storage; the agent does not choose
an arbitrary table or claim kind.

| Update kind | What the agent records | Why a later agent benefits |
| --- | --- | --- |
| `classify_role` | Architectural role and layer, such as handler, application service, domain logic, repository, validator, worker, middleware, or React component | Finds the right implementation layer without rereading every type |
| `add_membership` | Participation in a feature, pattern, Blueprint, workflow, boundary, capability, or concern, including the participant's role and importance | Reconstructs a complete feature or pattern from its members |
| `connect_nodes` | An evidence-backed assessed relation such as delegates-to, orchestrates, validates, persists-through, or crosses-boundary-to | Fills relationships that static analysis cannot prove |
| `describe_behavior` | Responsibility, inputs, outputs, preconditions, postconditions, side effects, and async or transaction boundaries | Gives a compact behavioral summary without replacing source facts |
| `record_effect` | Database, cache, queue, external-service, file, state, or telemetry effect | Reveals operational consequences and data dependencies |
| `record_contract` | Request, response, command, event, configuration, row, UI, or serialization contract and compatibility scope | Identifies public contracts and compatibility risk |
| `record_failure` | Failure mode, observable outcome, retryability, target dependency, and transport status | Exposes negative paths that ordinary call graphs miss |
| `record_lifecycle` | Service lifetime, execution boundary, cancellation, retry, transaction, and concurrency behavior | Prevents request/background and lifetime mistakes |
| `record_change_guidance` | `must_change`, `likely_change`, `verify`, `do_not_edit`, or generated-source guidance | Preserves an evidence-backed change surface for future work |
| `link_test` | Test node, coverage kind, scenarios, and focused verification command | Lets agents verify a change with the smallest relevant test set |
| `link_documentation` | Explicit explains, governs, runbook, decision, example, or deprecation relation | Makes prose available through documentation queries without polluting code usages |
| `mark_landmark` | Entry point, hotspot, contract, data boundary, composition root, bridge, high-usage node, or security boundary | Improves navigation and Context Pack ranking |
| `record_precedent` | A node to use, avoid, or use conditionally as the closest implementation precedent | Stops repeated "find the similar feature" searches |
| `record_design_intent` | Design decision, compatibility requirement, migration strategy, workaround, deprecation, or security/performance/operations assumption | Preserves why a non-obvious design exists and when it may be removed |
| `record_constraint` | Architectural, security, performance, compatibility, operational, testing, generation, or data rule | Prevents future changes from violating local boundaries distributed across the codebase |
| `add_alias` | Domain term, legacy name, acronym, external name, UI label, database name, or useful search term | Lets agents find a concept using task vocabulary rather than only source identifiers |
| `resolve_dynamic_target` | DI, runtime registration, reflection, dispatch, route, configuration, or generated target resolution | Adds qualified runtime knowledge where static resolution is incomplete |
| `report_knowledge_gap` | A precise unresolved question, why reuse is unsafe, and suggested follow-up queries | Makes uncertainty queryable instead of hiding it in prose |
| `review_assessment` | Revalidate, dispute, reject, or supersede an earlier claim | Lets agents correct the shared map without erasing history |

The version 1.0 JSON Schema models these as a discriminated `update` union. Each
kind has its own required and allowed fields. Cartographer derives the internal
dimension and claim vocabulary from the update kind, preventing mismatched input
such as a lifecycle payload labeled as a documentation claim.

## Architectural Role Classification

An agent can classify a canonical node as one of the common roles:

- Endpoint, handler, service, application service, domain service, or domain
  logic.
- Repository, data access, external gateway, mapper, or validator.
- Middleware, filter, worker, scheduler, message consumer, or producer.
- Frontend component, hook, or state store.
- Composition root, migration, test fixture, or generated output.

The classification also records the architectural layer: presentation,
application, domain, infrastructure, data, integration, frontend, test, build,
or cross-cutting.

A role is contextual. A class may be both an application service and the handler
participant in a specific workflow. Canonical node identity remains singular,
while multiple scoped role assessments can coexist with their conditions and
evidence.

## Features, Patterns, and Blueprints

`add_membership` can create or reuse an assessment-owned grouping node. Supported
group kinds are feature, pattern, Blueprint, subsystem, bounded context,
workflow, architectural boundary, business capability, and cross-cutting
concern.

A group uses a stable workspace-scoped key, for example:

```text
pattern:vertical-slice:customer-search
feature:customer-search
subsystem:customer-management
bounded-context:customer-identity
workflow:customer-search-request
boundary:billing-integration
concern:tenant-authorization
```

The group is not presented as compiler truth. It is an assessment entity whose
definition, creator, generation, evidence, confidence, and status are visible in
queries.

Each membership records:

- The member's exact canonical node identity.
- A pattern-specific participant role such as endpoint, validator, handler,
  application_service, domain_logic, repository, mapper, response, UI client, or
  test.
- Strength: core, supporting, or merely related.
- Optional ordinal for an expected behavioral sequence.

This allows a query for "pattern X" to return both the member set and each
member's responsibility. A vertical-slice pattern can therefore expose:

```text
endpoint -> validator -> handler -> domain_logic -> repository -> database
                                                    -> response -> frontend
```

The Route remains a graph projection over exact relations; membership does not
pretend that sequence alone proves a runtime call.

## Where Agent Enrichment Saves Work

### Workspace Understanding

Static analyzers should discover projects, target frameworks, hosts, commands,
and dependencies. Agents add only interpretations that cannot be reliably
derived, such as "this nominal library is the shared domain boundary" or "this
migration project is intentionally isolated from the default build."

### Finding the Closest Feature

After comparing candidates, an agent records:

- Feature and pattern memberships.
- Each participant's architectural role.
- The preferred or discouraged precedent and where it applies.
- Important differences that prevent blind copying.
- Missing or stale evidence as a knowledge gap.

### Tracing Complete Behavior

Static call and reference edges provide the skeleton. The agent can add dynamic
DI resolutions, orchestration intent, side effects, contracts, failure outcomes,
transaction boundaries, and request-to-background transitions.

### Determining the Change Surface

The agent can mark nodes as `must_change`, `likely_change`, `verify`, or
`do_not_edit`, attach reasons, identify the canonical source for generated
outputs, and link the focused tests and commands needed for verification.

These are snapshots tied to a task and Atlas generation, not permanent facts.
Dependency changes make them stale.

### Understanding Failure and Lifecycle

An agent can persist conclusions about retries, cancellation propagation,
transactions, concurrency assumptions, service lifetime, exception conversion,
result types, and observable logging. This is especially useful when behavior is
distributed across middleware, registrations, and library conventions.

### After Implementing a Change

After the code is reindexed, the agent can:

1. Review affected assessments against the new generation.
2. Revalidate conclusions that still hold.
3. Supersede changed pattern memberships or behavior summaries.
4. Link newly added tests and documentation.
5. Record knowledge gaps discovered during verification.

The source diff and analyzers update canonical facts. The agent records intent,
interpretation, and verified guidance rather than duplicating the diff as prose.

## Autonomous Recording Policy

An agent should update the Atlas on its own when all of these are true:

1. The conclusion is likely to matter to another feature, debugging, review, or
   maintenance task.
2. It is not already represented by a current canonical or accepted fact.
3. The subject and evidence resolve exactly in the current Atlas generation.
4. The conclusion can be expressed through a typed update intent.
5. Confidence, conditions, and remaining uncertainty are stated honestly.

Good autonomous updates include feature membership, pattern participation,
architectural roles, preferred precedents, dynamic targets, non-obvious effects,
failure/lifecycle behavior, safe edit locations, focused tests, and explicit
knowledge gaps. Design intent, local constraints, and aliases are also useful
when they explain non-obvious structure or bridge task vocabulary to source
identifiers.

Agents should not record:

- Trivial facts directly visible from one declaration.
- A restatement of canonical references, signatures, or configuration.
- Guesses without resolvable evidence.
- Task-specific scratch notes with no expected reuse value.
- Raw prompts, hidden reasoning, full source bodies, or transcripts.
- Claims whose only purpose is to inflate confidence in another unsupported
  claim.

Default status is `proposed`. Workspace policy may accept high-confidence agent
updates automatically only when evidence, author permissions, freshness, and the
update kind satisfy an explicit threshold. Conflicts are retained and surfaced.

## Self-Correction

Agent-authored knowledge must be easy to challenge. `review_assessment` supports:

- `revalidate` after checking the original conclusion against current evidence.
- `dispute` when credible evidence conflicts but a final choice is unresolved.
- `reject` when the conclusion is wrong.
- `supersede` when a new, better-scoped conclusion replaces it.

No review deletes history. Queries return the current selected result together
with conflict and provenance metadata when requested.

## Query Behavior

Self-enrichment adds focused query paths:

- Get role and layer assessments for a node.
- Get all members and participant roles for a feature, pattern, or Blueprint.
- Get assessed edges separately from analyzer-proven edges.
- Get behavior, effects, contracts, failures, and lifecycle facets.
- Get current change guidance and linked verification.
- Get unresolved knowledge gaps that block safe reuse.
- Get assessment history, conflicts, reviews, and staleness.

Combined Context Packs may include selected accepted assessments, but every item
is labeled with provenance and freshness. Facts-only queries continue to exclude
all AI-authored updates.

## Command Contract

All update kinds use the same versioned envelope, evidence model, generation
pinning, idempotency rules, and transactional behavior defined in
[Node Decoration Command](NODE_DECORATION_COMMAND.md). The authoritative schema
is [`contracts/node-decoration-batch.schema.json`](contracts/node-decoration-batch.schema.json),
with a role-and-pattern example in
[`contracts/node-decoration-batch.example.json`](contracts/node-decoration-batch.example.json).
