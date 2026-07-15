# Node Knowledge and Assessment Model

## Purpose

Kraken Atlas nodes must carry enough queryable knowledge that an AI coding agent
can understand a workspace, find a precedent, trace behavior, estimate a change
surface, and inspect failure or lifecycle behavior without reconstructing the
same conclusions on every task.

The word "carry" does not mean placing one large summary column on `entities`.
It means that every canonical entity can be joined to typed knowledge facets,
relations, evidence, derived projections, and optional agent assessments through
stable identity and generation-aware query services.

## Core Principle

The Atlas separates four kinds of knowledge:

1. **Canonical facts:** compiler-, configuration-, framework-, or parser-backed
   facts that can be reproduced offline.
2. **Deterministic derived facts:** Routes, metrics, pattern instances,
   similarities, and impact projections produced by versioned algorithms.
3. **Agent assessments:** structured conclusions recorded by an AI agent when
   static analysis cannot fully determine intent, architectural role, feature
   boundary, preferred precedent, or change risk.
4. **Manual annotations:** user-authored corrections, labels, and decisions.

Agent assessments and manual annotations never overwrite canonical facts. They
are separate claims with their own provenance, evidence, freshness, and status.

## Node Knowledge Envelope

Every entity query should be able to return a bounded knowledge envelope. The
caller selects dimensions and budgets; the service does not dump every facet by
default.

### Identity and Freshness

- Numeric entity ID and stable analyzer-owned key.
- Kind, name, qualified name, language, project, and containing entity.
- Atlas generation, overlay state, source fingerprint, and analyzer fidelity.
- Canonical declaration or edit location and generated status.

### Workspace Orientation

- Solution and project membership.
- Multi-valued project facets such as application, library, test, web host,
  worker, migration, database, frontend, tool, and generator.
- Target frameworks, configurations, platforms, runtime identifiers, package
  managers, SDKs, and major framework markers.
- Project, package, and build dependencies.
- Executable host, entry-point, and startup composition.
- Build, test, run, format, generate, package, and migration commands.
- Governing repository rules and convention references with scope and
  precedence.

### Feature and Pattern Membership

- Feature or subsystem membership with evidence and boundary quality.
- Architectural role such as endpoint, handler, service, repository, aggregate,
  validator, mapper, client, page, component, worker, or adapter.
- Deterministic pattern instances such as controller-service-repository,
  vertical slice, MediatR request-handler, domain event, outbox, or unit of work.
- Similar-feature candidates, match dimensions, distance, and distinguishing
  differences.
- Canonical example or preferred repository precedent when supported by
  evidence or an explicit assessment.

Pattern names inferred by an agent are assessments unless a deterministic
recognizer can prove the structure. Naming convention alone is not proof.

### Behavior and Routes

- Incoming triggers: endpoint, UI action, schedule, message, event, or command.
- Authentication, authorization, middleware, filter, binding, and validation
  participation.
- Calls, construction, runtime composition, dispatch candidates, and dependency
  resolution.
- Domain operations and state transitions.
- Database, cache, queue, filesystem, HTTP, email, notification, logging,
  metric, tracing, and audit effects.
- Response contract, serialization, client, frontend state, and UI destination.
- Directed execution, dependency, HTTP, data, messaging, and full-stack Routes.

### Contract and Data Shape

- Public API, request, response, message, persistence, and generated-client
  contract membership.
- Member nullability, required status, serialized name, converter, and default.
- Validator and mapping relations.
- Database table, column, key, relationship, query, and migration relations.
- Compatibility constraints, known consumers, obsolete members, and replacement
  links.

### Change Surface

- Direct semantic dependents and callers.
- Runtime composition and framework dependents.
- Contracts, mappings, validators, database objects, migrations, configuration,
  generated artifacts, and tests.
- Target-framework and build-condition variants.
- Public compatibility and deployment risks.
- `must_change`, `likely_change`, and `verify` classifications with reasons.

Change surface is a generation-, configuration-, and algorithm-specific
projection. It must not be stored as an unconditional permanent property of the
entity.

### Failure and Lifecycle

- Exceptions thrown, caught, translated, suppressed, or exposed.
- Result and error values returned or propagated.
- Retry, timeout, fallback, circuit-breaker, and dead-letter behavior.
- Cancellation-token acceptance and propagation.
- Transaction, savepoint, unit-of-work, concurrency, idempotency, and rollback
  boundaries.
- Singleton, scoped, transient, request, background, and process lifetime.
- Synchronous, asynchronous, process, network, or messaging boundary crossings.
- Logging, metrics, tracing, and audit behavior associated with failure paths.

### Testing and Verification

- Direct and transitive test relationships.
- Fixture, mock, host, data, and environment requirements.
- Assertions that observe outputs or side effects.
- Focused build, test, formatting, generation, migration, and packaging commands.
- Known untested paths and degraded test-selection confidence.

### Documentation

- ADR, guide, runbook, specification, example, and release-note relations.
- Governing instruction sections and architectural rationale.
- Documentation freshness, supersession, and broken links.

Documentation remains in the `documentation` domain. Its links can decorate an
entity knowledge envelope without becoming code usages.

## Automatic and Agent-Enriched Dimensions

### Fully Offline and Deterministic

The following should normally be generated without an LLM:

- Workspace topology, project facets, frameworks, target frameworks, and
  dependencies.
- Build and configuration facts from structured files.
- Symbols, declarations, references, calls, inheritance, and implementations.
- ASP.NET Core, EF Core, SQL, TypeScript, and React relations supported by
  semantic or framework evidence.
- DI registration, service lifetime, endpoint, contract, effect, and test
  relations where statically resolvable.
- Generated-file provenance and canonical edit locations.
- Bounded Routes, metrics, and impact sets produced by versioned algorithms.

### Deterministic First, Agent-Assisted When Needed

These dimensions should begin with reproducible candidates and allow an agent to
record a structured assessment:

- Feature and subsystem boundaries.
- Closest existing feature or preferred implementation precedent.
- Architectural pattern name and role when several interpretations fit.
- Intent or rationale not represented by code or documentation.
- Likely change and verification risk beyond proven semantic impact.
- Dynamic runtime behavior that static analysis cannot resolve.
- Repository conventions expressed only in prose.

### Agent Assessment Only

Some conclusions may initially require an agent:

- "This is the preferred example for adding an authenticated CRUD endpoint."
- "These files form the Billing Retry feature despite crossing project
  boundaries."
- "Changing this contract is likely to affect an external consumer not present
  in the workspace."
- "This apparently duplicate service is a compatibility adapter and should not
  be used as a precedent."

These are valuable reusable conclusions, but they must remain clearly marked as
assessments rather than compiler truth.

## Storage Model

High-volume semantic and framework data continues to use dedicated typed tables.
A generic JSON property bag must not replace canonical schema. The enrichment
plane adds a structured claim ledger for facts that cannot be represented as
ordinary canonical relations.

### Typed Facet Tables

Examples include:

- `project_facets`
- `build_dimensions`
- `workspace_commands`
- `repository_rules`
- `feature_memberships`
- `pattern_instances`
- `entity_effects`
- `contract_memberships`
- `lifecycle_facets`
- `test_relationships`
- `change_surface_snapshots`
- `change_surface_items`

Each row includes entity identity, applicable generation, source analyzer,
conditions, and evidence or derivation metadata.

### Analysis Sessions

`analysis_sessions` records one bounded analysis pass:

- Session ID, workspace, Atlas generation, and optional task fingerprint.
- Agent or tool identity, model identifier where applicable, and analyzer
  version.
- Purpose, scope, target framework, configuration, and selected seeds.
- Start and completion time, status, and diagnostics.
- Input entity, relation, document, and file fingerprints.

The Atlas stores conclusions and evidence, not private chain-of-thought or an
unbounded transcript. Raw prompts and source bodies are not required for reuse.

### Assessment Claims

`assessment_claims` records a typed conclusion:

- Claim ID, session ID, subject entity, claim kind, dimension, and schema
  version.
- Structured value or target entity.
- Scope and conditions.
- Confidence where confidence is meaningful.
- Status: `proposed`, `accepted`, `disputed`, `superseded`, `stale`, or
  `rejected`.
- Validated generation and last checked generation.
- Created and updated timestamps.

Claim kinds use a controlled vocabulary such as `feature_membership`,
`architectural_role`, `preferred_precedent`, `pattern_classification`,
`likely_change`, `verification_risk`, `dynamic_target`, or `intent_summary`.

### Assessment Evidence

`assessment_evidence` links claims to:

- Canonical entities and relations.
- Exact source locations.
- Derived Routes or change-surface snapshots.
- Documentation sections.
- Other claims, without creating circular proof.

Every accepted assessment requires at least one evidence item or an explicit
`manual` provenance reason.

### Assessment Dependencies

`assessment_dependencies` records the entity generations, relation versions,
file hashes, document fingerprints, and algorithm versions used by a claim.
These dependencies drive automatic staleness.

### Conflicts and Supersession

Multiple agents may disagree. Conflicting claims are retained and linked rather
than silently merged. A later accepted claim can supersede an earlier claim while
preserving history. Queries return conflict state and selection policy.

## Freshness and Invalidation

Assessment reuse is safe only when freshness is explicit:

1. A canonical fact is current when it belongs to the active Atlas generation or
   unsaved overlay.
2. A deterministic derived fact is current when its input generations and
   algorithm version still match.
3. An assessment is current when all recorded dependencies still match and no
   newer accepted claim supersedes it.
4. A changed dependency marks the assessment `stale`; it is never silently
   treated as current.
5. A future agent may revalidate a stale assessment, creating a new session and
   preserving the previous claim history.

Queries default to current facts and accepted current assessments. They can
optionally include stale, proposed, disputed, or superseded claims for audit.

## Query Contract

### `get_entity_context`

Returns a bounded knowledge envelope for one exact entity. Parameters select
dimensions, target configuration, assessment policy, evidence depth, and result
budget.

Example dimensions:

- `orientation`
- `feature`
- `behavior`
- `contracts`
- `effects`
- `change_surface`
- `failure`
- `lifecycle`
- `tests`
- `documentation`
- `assessments`

### `get_entity_facts`

Returns canonical and deterministic facts only. It never mixes agent assessments
into compiler or framework results.

### `get_entity_assessments`

Returns assessment claims, evidence, freshness, conflicts, and session metadata
for an entity or dimension.

### `get_feature_context`

Returns the same dimensions for a feature membership or Blueprint rather than a
single entity.

### `begin_analysis_session`

Creates a bounded session against an exact Atlas generation and declared scope.
Write access is explicit and separate from ordinary read queries.

### `record_assessment_claims`

Accepts schema-validated typed claims, evidence, and dependencies. It does not
accept arbitrary SQL or overwrite canonical rows.

The external batch form is the versioned `decorate_nodes` operation defined in
[Node Decoration Command](NODE_DECORATION_COMMAND.md). Its authoritative JSON
Schema and example live under `docs/planning/contracts`. CLI, JSON-RPC, MCP, and
VS Code adapters must validate and invoke this same application operation.

The payload uses typed update intents rather than a single generic claim shape.
Agents can classify roles, add feature or pattern memberships, connect nodes,
describe behavior and operational facets, record change guidance, link tests or
documentation, mark Landmarks, resolve dynamic targets, report knowledge gaps,
and review prior assessments. See
[AI Self-Enrichment](AI_SELF_ENRICHMENT.md).

### `complete_analysis_session`

Finalizes the session, validates required evidence, computes freshness metadata,
and makes accepted claims available according to policy.

### `invalidate_assessments`

Normally invoked automatically after a generation change. Manual invalidation is
available for claims known to be incorrect even when their source dependencies
did not change.

## Answering the Feature Questions from Nodes

### Understand the Workspace

Workspace, solution, and project nodes expose topology, roles, frameworks,
dependencies, hosts, commands, and governing rules through orientation facets.

### Find the Closest Existing Feature

Endpoint, command, page, service, entity, and workflow nodes expose feature
memberships, pattern instances, architectural roles, generated provenance, and
similarity projections. Accepted `preferred_precedent` assessments can record a
repository-specific choice for future agents.

### Trace Complete Behavior

Entry-point and feature nodes expose directed Routes through security, pipeline,
handler, domain, dependency, effect, contract, client, and UI dimensions.

### Determine the Change Surface

Any exact entity can expose a generation- and configuration-specific change
surface grouped into `must_change`, `likely_change`, and `verify`, including
tests and compatibility risks.

### Understand Failure and Lifecycle Behavior

Callable, service, endpoint, worker, and feature nodes expose failure relations,
cancellation, transactions, concurrency, observability, service lifetime, and
boundary crossings.

## Context Pack Behavior

Context Packs may use accepted current assessments as ranking or inclusion
signals. They must label assessment-derived content, include its evidence, and
report when a useful assessment is stale or disputed. Assessments cannot make an
otherwise unresolved compiler edge appear exact.

Agent-written intent summaries should be concise structured conclusions, not a
substitute for source slices or canonical relations.

## Security and Governance

- Assessment writes require explicit client capability and Workspace Trust.
- Claims are local by default and never sent to a remote service by Atlas.
- Secret values, source bodies, raw prompts, and chain-of-thought are not stored
  as assessment metadata.
- Agent/model identity is recorded for audit without making trust depend on a
  brand or model name.
- Users can inspect, reject, supersede, export, or delete assessments.
- Team-shared assessments are deferred until ownership and trust policies exist.

## Acceptance Criteria

The node-knowledge model is successful when:

- A new agent can retrieve the five feature-work dimensions without unrestricted
  repository search.
- Repeated tasks reuse current assessments instead of recomputing the same
  feature boundaries and preferred precedents.
- Canonical facts and agent assessments remain visibly distinct.
- A source change automatically marks dependent assessments stale.
- Conflicting assessments remain auditable.
- Every returned conclusion has evidence, provenance, generation, and scope.
- A node query stays bounded and returns only requested dimensions.
