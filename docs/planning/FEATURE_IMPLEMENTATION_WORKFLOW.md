# AI Feature Implementation Workflow

## Purpose

This document defines what Kraken Atlas should provide when an AI coding agent
is asked to add a feature to an existing .NET Core or modern .NET C# project.
It describes the agent's normal investigation workflow, the relationship
dimensions needed to reduce repository reads, and the bounded queries that
should eventually support implementation planning.

The objective is not to replace source code or compiler analysis with a summary.
The objective is to let an agent retrieve the smallest evidence-backed feature
slice needed to make and verify a change.

## Normal Agent Workflow

### 1. Understand the Workspace

Before changing code, an agent normally needs to identify:

- Solutions, applications, libraries, tests, workers, database projects, and
  frontend projects.
- Target frameworks, project references, packages, build configurations, and
  conditional compilation.
- ASP.NET Core hosts, background processes, migration projects, and executable
  entry points.
- Repository build, test, formatting, generation, and contribution conventions.
- Failed or degraded projects that make the map incomplete.

### 2. Find the Closest Existing Feature

Most established repositories have a preferred way to implement a feature. The
agent should find the closest sibling feature by structure and behavior, not
only by lexical similarity. Useful comparison signals include:

- Endpoint shape, handler pattern, service boundary, and persistence strategy.
- Dependency-injection registrations and service lifetimes.
- DTO, validation, mapping, authorization, and error-handling patterns.
- Test style, fixture setup, naming, and assertion strategy.
- Database mappings, migrations, messages, events, and external integrations.

The nearest valid precedent often provides more implementation value than a
large list of usages.

### 3. Trace Complete Behavior

The agent should be able to follow a feature across:

1. Entry point, endpoint, scheduled trigger, message, or user action.
2. Middleware, filters, authorization, binding, and validation.
3. Handler, service, domain logic, and runtime-resolved dependencies.
4. Database, cache, filesystem, queue, or external HTTP effects.
5. Response DTO, serialization, generated client, frontend state, and UI.

Alternative dispatch targets, dynamic boundaries, and unresolved steps must be
visible rather than silently guessed.

### 4. Determine the Change Surface

Before editing, the agent normally investigates:

- Interfaces, implementations, callers, constructors, factories, and DI
  registrations.
- Public and serialized contracts, validators, mappers, and generated clients.
- EF Core entities, mappings, queries, migrations, and database objects.
- Configuration, feature flags, authorization policies, and environment-specific
  behavior.
- Tests, fixtures, documentation, deployment configuration, and operational
  checks.
- Other target frameworks, build configurations, and conditional code paths.

The response should distinguish proven impact from likely impact and items that
only require verification.

### 5. Understand Failure and Lifecycle Behavior

Feature implementation also requires non-happy-path context:

- Exceptions, result types, catches, retries, fallback, and dead-letter paths.
- Cancellation-token propagation and timeout ownership.
- Transaction, unit-of-work, concurrency, and idempotency boundaries.
- Singleton, scoped, transient, hosted-service, and request lifetimes.
- Logging, metrics, tracing, auditing, and security-relevant side effects.

### 6. Implement in the Existing Style

The agent selects the canonical edit locations, avoids generated outputs, and
uses the closest established pattern unless the task explicitly changes the
architecture. Every selected file or symbol should have an inclusion reason.

### 7. Verify the Feature

The map should help choose:

- The smallest projects that must build.
- Focused unit, integration, contract, and end-to-end tests.
- Generators, migrations, formatters, and static checks that must run.
- Documentation, deployment, and operational artifacts that may now be stale.

## Current Kraken Atlas Coverage

The current Phase 1 baseline supports solution, project, project-reference,
file, generation, and exact structural entity facts. It reduces initial
discovery cost but does not yet satisfy the complete workspace-orientation
requirement.

Kraken Atlas must also persist and query project facets, framework and build
dimensions, executable hosts, build/test/run/generation commands, and governing
repository conventions. These are part of the Atlas itself; an agent should not
have to rediscover them through unrestricted file reads on every task.

The following capabilities require later phases:

- Compiler-bound symbols, calls, references, type use, inheritance, and
  implementations.
- ASP.NET Core endpoints, middleware, DI, authorization, and contracts.
- Database mappings, queries, migrations, and object-level reads and writes.
- TypeScript and React semantics and cross-stack HTTP Routes.
- Complete project-role classification, structured command extraction, and
  repository-rule precedence.
- Tests related to behavior rather than only project membership.
- Feature precedent, failure-flow, value-flow, and change-surface projections.

## Relationship Dimensions

### Build and Configuration

Required facts and relations include:

- Project targets framework, configuration, runtime, and platform.
- Source is included under an MSBuild condition or compilation constant.
- Behavior is controlled by an option, environment variable, or feature flag.
- Generated artifact is produced from a specific input and generator.

Queries must be able to select a target framework and configuration. Facts that
only exist under one condition must not be presented as unconditional.

### Runtime Composition

Required relations include:

- `registers`, `resolves`, `decorates`, `creates`, and `selects_implementation`.
- Service lifetime, keyed-service key, factory, open-generic registration, and
  registration condition.
- Constructor injection, method injection, options binding, and hosted-service
  activation.

This layer connects interface calls to the implementations that can actually
receive them in a configured application.

### Request and Trigger Pipeline

Required relations include:

- Route or trigger to endpoint, handler, job, command, or message consumer.
- Middleware, filter, binder, validator, authorization policy, and handler
  ordering.
- Request and response contract binding.

The result should preserve execution order when static evidence supports it.

### Contract and Data Shape

Required relations include:

- DTO and message properties to domain properties and database columns.
- Serializer name, converter, nullability, required status, and default value.
- Validator rule to validated member.
- Mapper profile or manual mapping from source member to target member.
- Server contract to generated or handwritten client contract.

Contract queries should identify process, HTTP, persistence, and messaging
boundaries because changes at those boundaries carry different risks.

### Value Flow

The Atlas should model bounded value-flow facts such as:

- Input member flows to validator, mapper, domain operation, persistence write,
  and response member.
- Configuration value flows to the behavior it controls.
- Database value flows to a serialized or displayed output.
- Sanitization, parsing, conversion, and redaction steps.

Value flow is not the same as method reachability. It should use operation-level
evidence and expose unresolved dynamic steps.

### Side Effects

Relations should distinguish effects on:

- Database objects and transactions.
- Cache keys and invalidation.
- Files and object storage.
- HTTP services and external APIs.
- Queues, topics, events, emails, and notifications.
- Logs, metrics, traces, and audit records.

Effects need an operation such as read, create, update, delete, publish, send,
invalidate, or execute.

### Failure Flow

Required relations include:

- `throws`, `catches`, `returns_error`, `retries`, `falls_back_to`, and
  `dead_letters_to`.
- Cancellation and timeout propagation.
- Transaction rollback and partial-side-effect boundaries.
- Exception or result mapping to HTTP, message, or UI errors.

### State and Messaging

Required relations include:

- Command or event publication and handler subscription.
- Queue, topic, routing key, and consumer binding.
- Outbox and inbox participation.
- State transition caused by a command, event, or operation.
- Idempotency key and deduplication ownership where statically visible.

### Persistence

Required facts include:

- EF Core model and table mapping.
- Query roots, predicates, includes, projections, and tracking mode.
- Read, insert, update, delete, procedure, and raw SQL effects.
- Transaction, savepoint, unit-of-work, and concurrency-token boundaries.
- Migration that introduced, renamed, or removed an object.

### Security

Required relations include:

- Endpoint or operation requires policy, role, claim, permission, or ownership
  check.
- Data member carries a sensitivity or redaction classification.
- Secret-bearing configuration is consumed by a service without exposing its
  value to Context Packs.
- Authentication scheme and authorization handler participate in a Route.

### Testing

Required relations include:

- Test directly calls or constructs an entity.
- Test reaches an entity through a host, endpoint, message, or fixture.
- Fixture creates data, configuration, mock, or server state used by a test.
- Assertion observes an output or side effect.
- Test command and project required to exercise a feature slice.

Static reachability and observed runtime coverage are separate provenance types.

### Operations and Deployment

Required relations include:

- Options and environment values to services and behavior.
- Health checks to dependencies.
- Deployment manifests to applications, ports, storage, queues, and databases.
- Logging and telemetry categories to feature entry points.
- Feature to runbook through the separate documentation relation domain.

### Compatibility and Public Surface

Required facts include:

- Public API and package surface.
- Serialized, HTTP, database, and message contracts.
- Obsolete member and replacement relation.
- Known external consumer or generated client.
- Versioning and compatibility policy where repository evidence exists.

### History and Ownership

Git-derived projections may include:

- Ownership, CODEOWNERS coverage, likely maintainers, churn, and age.
- Files and entities that frequently change together.
- Regressions or fixes associated with an entity.

Historical correlation is not semantic truth. It uses separate provenance and
must not be represented as a compiler or runtime dependency.

### Documentation

ADRs, guides, runbooks, examples, and specifications remain connected through
the `documentation` relation domain. They are never returned as code usages.
Feature Context Packs include them only under an explicit documentation policy.

## Relation Metadata

These dimensions should extend one canonical Atlas rather than create unrelated
graphs. Every relation should carry or inherit enough metadata to filter by:

- Relation domain and kind.
- Direction and logical scope.
- Target framework, build configuration, environment, or feature condition.
- Provenance, resolution, and heuristic confidence where applicable.
- Source evidence and analyzer version.
- Atlas generation, freshness, and overlay state.
- Read, write, create, delete, publish, or other effect.
- Synchronous, asynchronous, process, network, or messaging boundary.

## Feature-Oriented Queries

The following composite queries should be added over the canonical query
services:

### `find_similar_features`

Finds structurally similar repository features using entry-point kind,
framework shape, relation profile, contracts, dependencies, persistence style,
and test style. It returns ranked candidates and the evidence for each matching
dimension. Lexical similarity is only one signal.

### `get_feature_blueprint`

Returns a bounded Blueprint for an endpoint, trigger, symbol, route, database
object, or frontend feature. The projection includes entry points, execution
Routes, contracts, runtime composition, effects, tests, configuration, and
explicitly requested documentation.

### `trace_value_flow`

Traces selected values or members through validation, conversion, mapping,
domain logic, persistence, and output. It reports unsupported or dynamic steps.

### `get_runtime_composition`

Returns registrations, conditions, lifetimes, factories, decorators, and
possible runtime implementations for an abstraction or consuming entity.

### `get_contract_boundary`

Returns serialized members, validators, mappers, clients, consumers, versioning
facts, and persistence mappings associated with a contract.

### `get_failure_paths`

Returns exceptions, result failures, retries, fallback, cancellation, rollback,
and externally visible error mappings reachable from a seed.

### `get_configuration_matrix`

Shows how target framework, build configuration, environment, feature flags,
and options alter the entities and Routes relevant to a feature.

### `get_change_surface`

Groups impact into:

- `must_change`: compiler-bound, framework-bound, schema-bound, or contract-bound
  dependencies that require an edit.
- `likely_change`: established sibling-pattern or strong behavioral coupling.
- `verify`: tests, configuration, documentation, deployment, dynamic dispatch,
  and operational behavior that require inspection or execution.

Each item includes relation evidence, reason, freshness, and the verification
command when known.

### `get_related_tests`

Returns directly and transitively related tests with connection evidence,
fixture requirements, test project, and focused execution command.

### `build_feature_context_pack`

Accepts a task, optional seeds, profile, target configuration, and token budget.
It combines the minimum implementation symbols, precedent, Routes, contracts,
effects, tests, and verification steps. Documentation remains under its own
policy and token allowance.

## Feature Blueprint Response

A feature Blueprint intended for an agent should contain:

1. Resolved seed and ambiguity report.
2. Closest repository precedent and why it matches.
3. Entry points and directed behavior Routes.
4. Runtime composition and configuration conditions.
5. Contracts, value flow, side effects, and failure paths.
6. `must_change`, `likely_change`, and `verify` change-surface groups.
7. Related tests and focused verification commands.
8. Canonical edit locations and generated files that must not be edited.
9. Freshness, failed analyzers, unresolved boundaries, and omissions.
10. Optional documentation sections reported separately from code facts.

## Priority

After core Roslyn declarations, references, calls, type relationships, and exact
symbol identity, the highest-value feature-work additions are:

1. Similar-feature and repository-precedent detection.
2. Runtime DI composition and ASP.NET Core request Routes.
3. Contracts, validation, mapping, and related-test selection.
4. EF Core persistence effects and transaction boundaries.
5. Value flow, failure flow, messaging, and operational configuration.
6. Historical, ownership, compatibility, and runtime-coverage projections.

This ordering is based on how much repeated repository reading each layer can
remove from a normal feature implementation task.

## Reusable Agent Assessments

Feature boundaries, pattern labels, preferred precedents, dynamic behavior, and
verification risks may need an agent's first-pass judgment. Kraken Atlas stores
those conclusions as typed assessment claims attached to canonical nodes, with
evidence and source dependencies. Future agents can reuse current accepted
claims, improve or dispute them, and revalidate them after source changes.

Assessments remain separate from canonical facts and never turn an unresolved
semantic relation into an exact relation. The storage, freshness, conflict, and
query contract is defined in
[Node Knowledge and Assessment Model](NODE_KNOWLEDGE_MODEL.md).

## Acceptance Scenarios

The benchmark suite should eventually prove that an agent can use bounded Atlas
queries to answer:

- What existing feature should this implementation imitate?
- Which files and symbols must change to add this endpoint and persistence field?
- Which implementation will dependency injection select in the target host?
- How does an input member reach a database column and response member?
- What side effects and failure paths can this operation produce?
- Which target frameworks, environments, or feature flags alter the behavior?
- Which tests should be changed or run, and why?
- Which documentation discusses the feature without polluting code usage results?

An acceptance scenario passes only when the response is evidence-backed,
generation-aware, bounded by the requested budget, and complete enough for the
agent to implement the fixture feature without unrestricted repository search.
