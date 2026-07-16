using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private const string DecorationSchema =
        "https://raw.githubusercontent.com/GitBinaryKraken/KrakenAtlas/main/docs/planning/contracts/node-decoration-batch.schema.json";

    private static readonly JsonSerializerOptions AssessmentJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static readonly Regex OperationIdPattern = new(
        "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
        RegexOptions.CultureInvariant);

    private static readonly IReadOnlyDictionary<string, UpdateShape> UpdateShapes =
        new Dictionary<string, UpdateShape>(StringComparer.Ordinal)
        {
            ["classify_role"] = Shape("architecture", ["role", "layer"], ["customRole", "responsibility"]),
            ["add_membership"] = Shape("membership", ["group", "participantRole", "strength"], ["ordinal"]),
            ["connect_nodes"] = Shape("behavior", ["target", "relationKind"], ["routeRole"]),
            ["describe_behavior"] = Shape("behavior", ["responsibility"],
                ["inputs", "outputs", "preconditions", "postconditions", "sideEffects", "asyncBoundary", "transactionBoundary"]),
            ["record_effect"] = Shape("effects", ["effectKind"], ["target", "resource", "operation", "direct"]),
            ["record_contract"] = Shape("contracts", ["target", "contractRole", "compatibility"], ["format"]),
            ["record_failure"] = Shape("failure", ["failureKind", "outcome"], ["target", "retryable", "transportStatus"]),
            ["record_lifecycle"] = Shape("lifecycle", ["lifetime", "boundary"], ["cancellation", "retry", "transaction", "concurrency"]),
            ["record_change_guidance"] = Shape("change_surface", ["classification", "reason"], ["editInstead", "verification"]),
            ["link_test"] = Shape("tests", ["target", "coverageKind"], ["scenarios", "verificationCommand"]),
            ["link_documentation"] = Shape("documentation", ["relationKind"], ["documentId", "path", "heading"]),
            ["mark_landmark"] = Shape("landmarks", ["landmarkKind", "importance"], []),
            ["record_precedent"] = Shape("precedent", ["target", "recommendation", "applicability"], ["importantDifferences"]),
            ["record_design_intent"] = Shape("intent", ["intentKind", "rationale"], ["expiresWhen"]),
            ["record_constraint"] = Shape("constraints", ["constraintKind", "rule", "strength"], ["consequence"]),
            ["add_alias"] = Shape("aliases", ["alias", "aliasKind"], ["locale"]),
            ["resolve_dynamic_target"] = Shape("runtime", ["target", "mechanism"], ["alternatives", "resolutionScope"]),
            ["report_knowledge_gap"] = Shape("knowledge_gaps", ["gapKind", "question"], ["suggestedQueries", "blocksReuse"]),
            ["review_assessment"] = Shape("reviews", ["claimId", "action", "reason"], [])
        };

    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> UpdateEnums =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.Ordinal)
        {
            ["classify_role.role"] = Values(["endpoint", "handler", "service", "application_service", "domain_service", "domain_logic", "repository", "data_access", "validator", "mapper", "middleware", "filter", "worker", "message_consumer", "message_producer", "scheduler", "external_gateway", "frontend_component", "frontend_hook", "state_store", "composition_root", "migration", "test_fixture", "generated_output", "other"]),
            ["classify_role.layer"] = Values(["presentation", "application", "domain", "infrastructure", "data", "integration", "frontend", "test", "build", "cross_cutting", "unknown"]),
            ["add_membership.strength"] = Values(["core", "supporting", "related"]),
            ["connect_nodes.relationKind"] = Values(["delegates_to", "orchestrates", "validates", "transforms_to", "persists_through", "publishes_to", "consumes_from", "guards", "configures", "precedes", "follows", "similar_to", "alternate_to", "implements_intent_of", "depends_on_runtime", "crosses_boundary_to"]),
            ["record_effect.effectKind"] = Values(["database_read", "database_write", "cache_read", "cache_write", "message_publish", "message_consume", "external_call", "file_io", "state_change", "telemetry", "other"]),
            ["record_contract.contractRole"] = Values(["request", "response", "command", "event", "configuration", "database_row", "ui_model", "serialization"]),
            ["record_contract.compatibility"] = Values(["public", "internal", "private", "unknown"]),
            ["record_failure.failureKind"] = Values(["validation", "authentication", "authorization", "not_found", "conflict", "timeout", "cancellation", "concurrency", "transient_dependency", "permanent_dependency", "unhandled", "other"]),
            ["record_lifecycle.lifetime"] = Values(["singleton", "scoped", "transient", "request", "background_iteration", "process", "component", "custom", "unknown"]),
            ["record_lifecycle.boundary"] = Values(["request", "background", "message", "transaction", "component", "process", "other"]),
            ["record_change_guidance.classification"] = Values(["must_change", "likely_change", "verify", "do_not_edit", "generated_source_only"]),
            ["link_test.coverageKind"] = Values(["unit", "integration", "contract", "end_to_end", "snapshot", "fixture"]),
            ["link_documentation.relationKind"] = Values(["explains", "governs", "runbook_for", "decision_for", "example_for", "deprecates"]),
            ["mark_landmark.landmarkKind"] = Values(["entry_point", "hotspot", "public_contract", "data_boundary", "composition_root", "bridge", "high_usage", "security_boundary"]),
            ["record_precedent.recommendation"] = Values(["use", "avoid", "conditional"]),
            ["record_design_intent.intentKind"] = Values(["design_decision", "compatibility_requirement", "migration_strategy", "temporary_workaround", "deprecation", "security_assumption", "performance_assumption", "operational_assumption"]),
            ["record_constraint.constraintKind"] = Values(["architecture", "security", "performance", "compatibility", "operational", "testing", "generation", "data"]),
            ["record_constraint.strength"] = Values(["required", "enforced", "preferred", "advisory"]),
            ["add_alias.aliasKind"] = Values(["domain_term", "legacy_name", "acronym", "search_term", "external_name", "ui_label", "database_name"]),
            ["resolve_dynamic_target.mechanism"] = Values(["dependency_injection", "dynamic_dispatch", "reflection", "configuration_binding", "route_binding", "generated_source", "runtime_registration", "other"]),
            ["report_knowledge_gap.gapKind"] = Values(["unresolved_target", "ambiguous_pattern", "missing_test", "dynamic_behavior", "insufficient_evidence", "stale_documentation", "configuration_gap", "other"]),
            ["review_assessment.action"] = Values(["revalidate", "dispute", "reject", "supersede"])
        };

    private static readonly IReadOnlySet<string> GroupKinds = Values(
        ["feature", "pattern", "blueprint", "subsystem", "bounded_context", "workflow", "architectural_boundary", "business_capability", "cross_cutting_concern"]);

    public async Task<DecorateNodesResult> DecorateNodesAsync(
        string workspaceKey,
        NodeDecorationBatch batch,
        bool forceDryRun = false,
        CancellationToken cancellationToken = default)
    {
        ValidateBatchEnvelope(workspaceKey, batch);
        var normalizedPayload = JsonSerializer.Serialize(batch, AssessmentJsonOptions);
        if (Encoding.UTF8.GetByteCount(normalizedPayload) > 1_048_576)
        {
            throw new InvalidDataException("Decoration payload exceeds the 1 MiB limit.");
        }
        var payloadHash = Hash(normalizedPayload);
        var dryRun = forceDryRun || batch.Options?.DryRun == true;

        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var workspace = await ReadAssessmentWorkspaceAsync(connection, workspaceKey, cancellationToken)
            ?? throw new InvalidOperationException("The Atlas has not been built for this workspace.");
        if (workspace.Generation != batch.Workspace.ExpectedAtlasGeneration)
        {
            throw new InvalidOperationException(
                $"Expected Atlas generation {batch.Workspace.ExpectedAtlasGeneration}, but the current generation is {workspace.Generation}.");
        }

        if (!dryRun)
        {
            var replay = await ReadOperationReplayAsync(
                connection, workspace.Id, batch.OperationId, payloadHash, cancellationToken);
            if (replay is not null)
            {
                return replay with { Status = "replayed" };
            }
        }

        var diagnostics = new List<DecorationDiagnostic>();
        var resolved = new List<ResolvedDecoration>();
        var clientUpdateIds = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < batch.Decorations.Count; index++)
        {
            var path = $"/decorations/{index}";
            var decoration = batch.Decorations[index];
            if (!clientUpdateIds.Add(decoration.ClientUpdateId))
            {
                throw new InvalidDataException($"{path}/clientUpdateId must be unique within the batch.");
            }
            resolved.Add(await ResolveDecorationAsync(
                connection,
                workspaceKey,
                workspace.Id,
                workspace.Generation,
                decoration,
                path,
                diagnostics,
                cancellationToken));
        }

        var sessionId = string.IsNullOrWhiteSpace(batch.Session.SessionId)
            ? $"session:{Guid.NewGuid():N}"
            : batch.Session.SessionId;
        var now = DateTimeOffset.UtcNow;
        var resultItems = resolved.Select(item => new DecorationResultItem(
            item.Decoration.ClientUpdateId,
            item.UpdateKind,
            item.Subject.Id,
            item.Status,
            [item.ClaimId],
            item.GroupKey,
            item.Evidence.Count,
            item.Dependencies.Count)).ToArray();
        var result = new DecorateNodesResult(
            "1.0",
            batch.OperationId,
            workspaceKey,
            workspace.Generation,
            sessionId!,
            dryRun ? "validated" : "applied",
            resultItems,
            diagnostics);
        if (dryRun)
        {
            return result;
        }

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        await InsertAnalysisSessionAsync(
            connection,
            transaction,
            workspace,
            batch,
            sessionId!,
            payloadHash,
            now,
            cancellationToken);
        foreach (var item in resolved)
        {
            await InsertAssessmentAsync(
                connection, transaction, workspace.Id, workspace.Generation, sessionId!, item, now, cancellationToken);
            await ApplyAssessmentReviewAsync(
                connection, transaction, workspace.Id, item, now, cancellationToken);
        }
        var resultJson = JsonSerializer.Serialize(result, AssessmentJsonOptions);
        await using (var complete = CreateCommand(
            connection,
            transaction,
            """
            UPDATE analysis_sessions
            SET status = 'completed', completed_utc = $completedUtc, result_json = $resultJson
            WHERE id = $sessionId;
            """))
        {
            complete.Parameters.AddWithValue("$completedUtc", now.ToString("O"));
            complete.Parameters.AddWithValue("$resultJson", resultJson);
            complete.Parameters.AddWithValue("$sessionId", sessionId);
            await complete.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    private static void ValidateBatchEnvelope(string workspaceKey, NodeDecorationBatch batch)
    {
        if (batch.Schema != DecorationSchema || batch.SchemaVersion != "1.0")
        {
            throw new InvalidDataException("Decoration payload must use the Kraken Atlas node-decoration schema version 1.0.");
        }
        if (batch.Workspace is null || batch.Session is null || batch.Session.Agent is null)
        {
            throw new InvalidDataException("Decoration workspace, session, and agent are required.");
        }
        if (!string.Equals(batch.Workspace.WorkspaceKey, workspaceKey, StringComparison.Ordinal))
        {
            throw new InvalidDataException("Decoration workspaceKey does not match the initialized workspace.");
        }
        if (string.IsNullOrWhiteSpace(batch.OperationId)
            || batch.OperationId.Length > 128
            || !OperationIdPattern.IsMatch(batch.OperationId))
        {
            throw new InvalidDataException("operationId is invalid.");
        }
        if (string.IsNullOrWhiteSpace(batch.Session.Agent.Name)
            || string.IsNullOrWhiteSpace(batch.Session.Purpose))
        {
            throw new InvalidDataException("session.agent.name and session.purpose are required.");
        }
        if (batch.Decorations is null || batch.Decorations.Count is < 1 or > 500)
        {
            throw new InvalidDataException("decorations must contain between 1 and 500 items.");
        }
        if (batch.Options?.Atomic == false)
        {
            throw new InvalidDataException("The alpha supports atomic decoration batches only.");
        }
        if (batch.Options?.ConflictPolicy is not (null or "record" or "reject"))
        {
            throw new InvalidDataException("options.conflictPolicy must be record or reject.");
        }
        if (batch.Options?.MissingSubjectPolicy is not (null or "reject"))
        {
            throw new InvalidDataException("The alpha supports missingSubjectPolicy reject only.");
        }
    }

    private async Task<ResolvedDecoration> ResolveDecorationAsync(
        SqliteConnection connection,
        string workspaceKey,
        long workspaceId,
        long generation,
        NodeDecoration decoration,
        string path,
        List<DecorationDiagnostic> diagnostics,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(decoration.ClientUpdateId)
            || decoration.ClientUpdateId.Length > 128
            || !OperationIdPattern.IsMatch(decoration.ClientUpdateId))
        {
            throw new InvalidDataException($"{path}/clientUpdateId is invalid.");
        }
        if (string.IsNullOrWhiteSpace(decoration.Statement) || decoration.Statement.Length > 4000)
        {
            throw new InvalidDataException($"{path}/statement must contain between 1 and 4000 characters.");
        }
        if (decoration.Confidence is < 0 or > 1)
        {
            throw new InvalidDataException($"{path}/confidence must be between 0 and 1.");
        }
        if (decoration.RequestedStatus is not ("proposed" or "accepted"))
        {
            throw new InvalidDataException($"{path}/requestedStatus must be proposed or accepted.");
        }
        if (decoration.DependencyPolicy is not ("capture_from_evidence" or "explicit"))
        {
            throw new InvalidDataException($"{path}/dependencyPolicy is invalid.");
        }
        if (decoration.Evidence is null || decoration.Evidence.Count is < 1 or > 64)
        {
            throw new InvalidDataException($"{path}/evidence must contain between 1 and 64 items.");
        }

        var subject = await ResolveSelectorAsync(
            connection, workspaceKey, generation, decoration.Subject, $"{path}/subject", cancellationToken);
        var updateKind = RequiredString(decoration.Update, "kind", $"{path}/update");
        if (!UpdateShapes.TryGetValue(updateKind, out var shape))
        {
            throw new InvalidDataException($"{path}/update/kind is not supported: {updateKind}.");
        }
        ValidateUpdateShape(decoration.Update, shape, path);
        var target = await ResolveUpdateTargetsAsync(
            connection, workspaceKey, generation, decoration.Update, path, cancellationToken);
        var groupKey = ReadGroupKey(decoration.Update);

        var evidence = new List<ResolvedEvidence>();
        var dependencies = new Dictionary<string, ResolvedDependency>(StringComparer.Ordinal);
        AddDependency(dependencies, await CreateEntityDependencyAsync(
            connection, generation, subject.StableKey, cancellationToken));
        if (updateKind == "review_assessment")
        {
            var reviewedClaimId = RequiredString(decoration.Update, "claimId", $"{path}/update");
            if (!await AssessmentClaimExistsAsync(connection, workspaceId, reviewedClaimId, cancellationToken))
            {
                throw new InvalidDataException($"{path}/update/claimId does not resolve in this workspace.");
            }
            AddDependency(dependencies, new ResolvedDependency("claim", reviewedClaimId, "present", null));
        }
        var hasCanonicalEvidence = false;
        for (var evidenceIndex = 0; evidenceIndex < decoration.Evidence.Count; evidenceIndex++)
        {
            var resolvedEvidence = await ResolveEvidenceAsync(
                connection,
                workspaceKey,
                workspaceId,
                generation,
                decoration.Evidence[evidenceIndex],
                $"{path}/evidence/{evidenceIndex}",
                cancellationToken);
            evidence.Add(resolvedEvidence);
            hasCanonicalEvidence |= resolvedEvidence.Kind != "manual";
            foreach (var dependency in resolvedEvidence.Dependencies)
            {
                AddDependency(dependencies, dependency);
            }
        }
        if (decoration.DependencyPolicy == "explicit")
        {
            if (decoration.Dependencies is null || decoration.Dependencies.Count == 0)
            {
                throw new InvalidDataException($"{path}/dependencies is required for explicit dependency policy.");
            }
            foreach (var dependency in decoration.Dependencies)
            {
                AddDependency(dependencies, await ResolveExplicitDependencyAsync(
                    connection, workspaceKey, workspaceId, generation, dependency, path, cancellationToken));
            }
        }

        var status = decoration.RequestedStatus;
        if (status == "accepted" && (!hasCanonicalEvidence || decoration.Confidence < 0.8))
        {
            status = "proposed";
            diagnostics.Add(new DecorationDiagnostic(
                "accepted_downgraded",
                path,
                "Accepted claims require canonical evidence and confidence of at least 0.8; the claim was stored as proposed."));
        }
        return new ResolvedDecoration(
            decoration,
            subject,
            updateKind,
            shape.Dimension,
            status,
            $"claim:{Guid.NewGuid():N}",
            target?.StableKey,
            groupKey,
            evidence,
            dependencies.Values.ToArray());
    }

    private static void ValidateUpdateShape(JsonElement update, UpdateShape shape, string path)
    {
        if (update.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException($"{path}/update must be an object.");
        }
        var allowed = shape.AllowedProperties.Append("kind").ToHashSet(StringComparer.Ordinal);
        foreach (var property in update.EnumerateObject())
        {
            if (!allowed.Contains(property.Name))
            {
                throw new InvalidDataException($"{path}/update/{property.Name} is not allowed for this update kind.");
            }
        }
        foreach (var required in shape.RequiredProperties)
        {
            if (!update.TryGetProperty(required, out var value)
                || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
                || value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(value.GetString()))
            {
                throw new InvalidDataException($"{path}/update/{required} is required.");
            }
        }
        var updateKind = update.GetProperty("kind").GetString()!;
        foreach (var entry in UpdateEnums.Where(entry => entry.Key.StartsWith($"{updateKind}.", StringComparison.Ordinal)))
        {
            var field = entry.Key[(updateKind.Length + 1)..];
            if (update.TryGetProperty(field, out var value)
                && (value.ValueKind != JsonValueKind.String || !entry.Value.Contains(value.GetString()!)))
            {
                throw new InvalidDataException($"{path}/update/{field} is outside the controlled vocabulary.");
            }
        }
        if (updateKind == "add_membership")
        {
            ValidateGroup(update.GetProperty("group"), path);
        }
    }

    private static void ValidateGroup(JsonElement group, string path)
    {
        if (group.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException($"{path}/update/group must be an object.");
        }
        var allowed = new HashSet<string>(["kind", "key", "name", "definition"], StringComparer.Ordinal);
        foreach (var property in group.EnumerateObject())
        {
            if (!allowed.Contains(property.Name))
            {
                throw new InvalidDataException($"{path}/update/group/{property.Name} is not allowed.");
            }
        }
        var kind = RequiredString(group, "kind", $"{path}/update/group");
        var key = RequiredString(group, "key", $"{path}/update/group");
        RequiredString(group, "name", $"{path}/update/group");
        if (!GroupKinds.Contains(kind) || key.Length is < 3 or > 256 || !Regex.IsMatch(key, "^[a-z][a-z0-9._:-]*$"))
        {
            throw new InvalidDataException($"{path}/update/group has an invalid kind or key.");
        }
    }

    private async Task<RelationEntity?> ResolveUpdateTargetsAsync(
        SqliteConnection connection,
        string workspaceKey,
        long generation,
        JsonElement update,
        string path,
        CancellationToken cancellationToken)
    {
        RelationEntity? first = null;
        foreach (var propertyName in new[] { "target", "editInstead" })
        {
            if (update.TryGetProperty(propertyName, out var targetElement)
                && targetElement.ValueKind == JsonValueKind.Object)
            {
                var target = await ResolveSelectorAsync(
                    connection,
                    workspaceKey,
                    generation,
                    ParseSelector(targetElement),
                    $"{path}/update/{propertyName}",
                    cancellationToken);
                first ??= target;
            }
        }
        if (update.TryGetProperty("alternatives", out var alternatives)
            && alternatives.ValueKind == JsonValueKind.Array)
        {
            var index = 0;
            foreach (var alternative in alternatives.EnumerateArray())
            {
                await ResolveSelectorAsync(
                    connection,
                    workspaceKey,
                    generation,
                    ParseSelector(alternative),
                    $"{path}/update/alternatives/{index++}",
                    cancellationToken);
            }
        }
        return first;
    }

    private static string? ReadGroupKey(JsonElement update)
    {
        if (!update.TryGetProperty("group", out var group)
            || group.ValueKind != JsonValueKind.Object
            || !group.TryGetProperty("key", out var key))
        {
            return null;
        }
        return key.GetString();
    }

    private async Task<ResolvedEvidence> ResolveEvidenceAsync(
        SqliteConnection connection,
        string workspaceKey,
        long workspaceId,
        long generation,
        JsonElement evidence,
        string path,
        CancellationToken cancellationToken)
    {
        var kind = RequiredString(evidence, "kind", path);
        var dependencies = new List<ResolvedDependency>();
        string summary;
        switch (kind)
        {
            case "entity":
            {
                var entity = await ResolveSelectorAsync(
                    connection,
                    workspaceKey,
                    generation,
                    ParseSelector(RequiredProperty(evidence, "entity", path)),
                    $"{path}/entity",
                    cancellationToken);
                dependencies.Add(await CreateEntityDependencyAsync(
                    connection, generation, entity.StableKey, cancellationToken));
                summary = $"entity {entity.QualifiedName}";
                break;
            }
            case "relation":
            {
                var source = await ResolveSelectorAsync(
                    connection, workspaceKey, generation,
                    ParseSelector(RequiredProperty(evidence, "source", path)),
                    $"{path}/source", cancellationToken);
                var target = await ResolveSelectorAsync(
                    connection, workspaceKey, generation,
                    ParseSelector(RequiredProperty(evidence, "target", path)),
                    $"{path}/target", cancellationToken);
                var relationKind = RequiredString(evidence, "relationKind", path);
                var relation = await ReadAssessmentRelationAsync(
                    connection, workspaceId, generation, source.Id, target.Id, relationKind, cancellationToken)
                    ?? throw new InvalidDataException($"{path} does not resolve to a current Atlas relation.");
                dependencies.Add(new ResolvedDependency(
                    "relation", relation.Id.ToString(), relation.Fingerprint, relation.DetailsJson));
                summary = $"relation {source.QualifiedName} -[{relationKind}]-> {target.QualifiedName}";
                break;
            }
            case "source_location":
            case "documentation":
            {
                var file = await ResolveEvidenceFileAsync(connection, workspaceId, generation, evidence, path, cancellationToken);
                dependencies.Add(new ResolvedDependency("file", file.StableKey, file.ContentHash, file.RelativePath));
                var line = evidence.TryGetProperty("startLine", out var lineElement) ? lineElement.GetInt32() : 1;
                summary = $"{kind} {file.RelativePath}:{line}";
                break;
            }
            case "claim":
            {
                var claimId = RequiredString(evidence, "claimId", path);
                if (!await AssessmentClaimExistsAsync(connection, workspaceId, claimId, cancellationToken))
                {
                    throw new InvalidDataException($"{path}/claimId does not resolve in this workspace.");
                }
                dependencies.Add(new ResolvedDependency("claim", claimId, "present", null));
                summary = $"claim {claimId}";
                break;
            }
            case "manual":
                summary = $"manual: {RequiredString(evidence, "reason", path)}";
                break;
            case "route":
                throw new InvalidDataException(
                    $"{path}: route evidence requires persisted Route snapshots, which are not available in this alpha.");
            default:
                throw new InvalidDataException($"{path}/kind is not supported: {kind}.");
        }
        if (evidence.TryGetProperty("note", out var note) && note.ValueKind == JsonValueKind.String)
        {
            summary += $" | {note.GetString()}";
        }
        return new ResolvedEvidence(kind, evidence.GetRawText(), summary, dependencies);
    }

    private async Task<ResolvedDependency> ResolveExplicitDependencyAsync(
        SqliteConnection connection,
        string workspaceKey,
        long workspaceId,
        long generation,
        JsonElement dependency,
        string path,
        CancellationToken cancellationToken)
    {
        var kind = RequiredString(dependency, "kind", $"{path}/dependencies");
        switch (kind)
        {
            case "entity":
            {
                var expectedGeneration = RequiredInt64(dependency, "expectedGeneration", path);
                if (expectedGeneration != generation)
                {
                    throw new InvalidDataException($"{path}/dependencies entity generation is not current.");
                }
                var entity = await ResolveSelectorAsync(
                    connection, workspaceKey, generation,
                    ParseSelector(RequiredProperty(dependency, "entity", path)), path, cancellationToken);
                return await CreateEntityDependencyAsync(connection, generation, entity.StableKey, cancellationToken);
            }
            case "file":
            {
                var file = await ReadFileByPathAsync(
                    connection, workspaceId, generation, RequiredString(dependency, "path", path), cancellationToken)
                    ?? throw new InvalidDataException($"{path}/dependencies file does not resolve.");
                var expected = RequiredString(dependency, "contentHash", path);
                if (!string.Equals(file.ContentHash, expected, StringComparison.Ordinal))
                {
                    throw new InvalidDataException($"{path}/dependencies file hash is not current.");
                }
                return new ResolvedDependency("file", file.StableKey, expected, file.RelativePath);
            }
            case "relation":
            {
                if (RequiredInt64(dependency, "expectedGeneration", path) != generation
                    || !long.TryParse(RequiredString(dependency, "relationId", path), out var relationId)
                    || !await RelationExistsAsync(connection, workspaceId, generation, relationId, cancellationToken))
                {
                    throw new InvalidDataException($"{path}/dependencies relation is not current.");
                }
                return new ResolvedDependency("relation_id", relationId.ToString(), "present", null);
            }
            case "analyzer":
            {
                var name = RequiredString(dependency, "name", path);
                var version = RequiredString(dependency, "version", path);
                if (!await AnalyzerVersionExistsAsync(connection, workspaceId, generation, name, version, cancellationToken))
                {
                    throw new InvalidDataException($"{path}/dependencies analyzer version is not current.");
                }
                return new ResolvedDependency("analyzer", name, version, null);
            }
            case "documentation":
                throw new InvalidDataException(
                    $"{path}/dependencies documentation requires the planned documentation index. Use documentation evidence with a current path instead.");
            default:
                throw new InvalidDataException($"{path}/dependencies kind is not supported: {kind}.");
        }
    }

    private async Task<RelationEntity> ResolveSelectorAsync(
        SqliteConnection connection,
        string workspaceKey,
        long generation,
        NodeSelector selector,
        string path,
        CancellationToken cancellationToken)
    {
        ValidateIdentity(selector.StableKey, selector.EntityId, path);
        var entity = await ReadRelationEntityAsync(
            connection, workspaceKey, generation, selector.StableKey, selector.EntityId, cancellationToken)
            ?? throw new InvalidDataException($"{path} does not resolve to a current Atlas entity.");
        if (selector.ExpectedKind is not null
            && !string.Equals(selector.ExpectedKind, entity.Kind, StringComparison.Ordinal))
        {
            throw new InvalidDataException($"{path}/expectedKind does not match {entity.Kind}.");
        }
        if (selector.ExpectedQualifiedName is not null
            && !string.Equals(selector.ExpectedQualifiedName, entity.QualifiedName, StringComparison.Ordinal))
        {
            throw new InvalidDataException($"{path}/expectedQualifiedName does not match {entity.QualifiedName}.");
        }
        return entity;
    }

    private static NodeSelector ParseSelector(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("Node selector must be an object.");
        }
        return new NodeSelector(
            OptionalString(value, "stableKey"),
            value.TryGetProperty("entityId", out var id) && id.TryGetInt64(out var parsedId) ? parsedId : null,
            OptionalString(value, "expectedKind"),
            OptionalString(value, "expectedQualifiedName"));
    }

    private static JsonElement RequiredProperty(JsonElement value, string property, string path) =>
        value.TryGetProperty(property, out var result)
            ? result
            : throw new InvalidDataException($"{path}/{property} is required.");

    private static string RequiredString(JsonElement value, string property, string path)
    {
        if (!value.TryGetProperty(property, out var result)
            || result.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(result.GetString()))
        {
            throw new InvalidDataException($"{path}/{property} must be a non-empty string.");
        }
        return result.GetString()!;
    }

    private static long RequiredInt64(JsonElement value, string property, string path)
    {
        if (!value.TryGetProperty(property, out var result) || !result.TryGetInt64(out var number))
        {
            throw new InvalidDataException($"{path}/{property} must be an integer.");
        }
        return number;
    }

    private static string? OptionalString(JsonElement value, string property) =>
        value.TryGetProperty(property, out var result) && result.ValueKind == JsonValueKind.String
            ? result.GetString()
            : null;

    private static JsonElement ParseJson(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static void AddDependency(
        IDictionary<string, ResolvedDependency> dependencies,
        ResolvedDependency dependency) =>
        dependencies[$"{dependency.Kind}|{dependency.StableKey}"] = dependency;

    private static UpdateShape Shape(
        string dimension,
        IReadOnlyList<string> required,
        IReadOnlyList<string> optional) =>
        new(dimension, required, required.Concat(optional).ToArray());

    private static IReadOnlySet<string> Values(IReadOnlyList<string> values) =>
        values.ToHashSet(StringComparer.Ordinal);

    private sealed record UpdateShape(
        string Dimension,
        IReadOnlyList<string> RequiredProperties,
        IReadOnlyList<string> AllowedProperties);

    private sealed record AssessmentWorkspace(long Id, long Generation);

    private sealed record ResolvedDecoration(
        NodeDecoration Decoration,
        RelationEntity Subject,
        string UpdateKind,
        string Dimension,
        string Status,
        string ClaimId,
        string? TargetStableKey,
        string? GroupKey,
        IReadOnlyList<ResolvedEvidence> Evidence,
        IReadOnlyList<ResolvedDependency> Dependencies);

    private sealed record ResolvedEvidence(
        string Kind,
        string Json,
        string Summary,
        IReadOnlyList<ResolvedDependency> Dependencies);

    private sealed record ResolvedDependency(
        string Kind,
        string StableKey,
        string ExpectedValue,
        string? DetailsJson);

    private sealed record AssessmentRelation(long Id, string Fingerprint, string DetailsJson);
    private sealed record AssessmentFile(string StableKey, string RelativePath, string ContentHash);

    private sealed record AssessmentRow(
        string ClaimId,
        string SessionId,
        string ClientUpdateId,
        string SubjectKey,
        string SubjectKind,
        string SubjectQualifiedName,
        string UpdateKind,
        string Dimension,
        string Statement,
        string UpdateJson,
        string? ConditionsJson,
        double Confidence,
        string Status,
        long ValidatedGeneration,
        long LastCheckedGeneration,
        string TagsJson,
        string CreatedUtc,
        string UpdatedUtc,
        string AgentName,
        string? AgentModel,
        string? AgentClient,
        long? CurrentEntityId);
}
