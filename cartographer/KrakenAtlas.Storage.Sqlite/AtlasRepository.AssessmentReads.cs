using System.Text.Json;
using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<AssessmentQueryResult> GetAssessmentsAsync(
        string workspaceKey,
        string? stableKey,
        long? id,
        bool includeProposed = false,
        bool includeStale = false,
        bool includeHistory = false,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        ValidateIdentity(stableKey, id, "Assessment query");
        if (limit is < 1 or > 200)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Assessment query limit must be between 1 and 200.");
        }
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var workspace = await ReadAssessmentWorkspaceAsync(connection, workspaceKey, cancellationToken);
        if (workspace is null)
        {
            return AssessmentQueryResult.NotCreated();
        }
        var focus = await ReadRelationEntityAsync(
            connection, workspaceKey, workspace.Generation, stableKey, id, cancellationToken);
        if (focus is null)
        {
            return AssessmentQueryResult.EntityNotFound(workspace.Generation);
        }
        var assessments = await ReadAssessmentsAsync(
            connection,
            workspace,
            [focus.StableKey],
            includeProposed,
            includeStale,
            includeHistory,
            limit + 1,
            cancellationToken);
        var truncated = assessments.Count > limit;
        return new AssessmentQueryResult(
            "current", workspace.Generation, focus, truncated, assessments.Take(limit).ToArray());
    }

    private async Task<IReadOnlyList<AgentAssessmentDetail>> GetAssessmentsForEntitiesAsync(
        string workspaceKey,
        IReadOnlyList<string> stableKeys,
        bool includeProposed,
        int limit,
        CancellationToken cancellationToken)
    {
        if (stableKeys.Count == 0)
        {
            return [];
        }
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var workspace = await ReadAssessmentWorkspaceAsync(connection, workspaceKey, cancellationToken);
        return workspace is null
            ? []
            : await ReadAssessmentsAsync(
                connection,
                workspace,
                stableKeys,
                includeProposed,
                false,
                false,
                limit,
                cancellationToken);
    }

    private async Task<IReadOnlyList<AgentAssessmentDetail>> ReadAssessmentsAsync(
        SqliteConnection connection,
        AssessmentWorkspace workspace,
        IReadOnlyList<string> stableKeys,
        bool includeProposed,
        bool includeStale,
        bool includeHistory,
        int limit,
        CancellationToken cancellationToken)
    {
        var distinctKeys = stableKeys.Distinct(StringComparer.Ordinal).ToArray();
        var keyParameters = string.Join(", ", distinctKeys.Select((_, index) => $"$key{index}"));
        var statuses = includeHistory
            ? "('accepted', 'proposed', 'disputed', 'superseded', 'rejected')"
            : includeProposed ? "('accepted', 'proposed')" : "('accepted')";
        await using var command = connection.CreateCommand();
        command.CommandText =
            $$"""
            SELECT c.id, c.session_id, c.client_update_id, c.subject_stable_key,
                   c.subject_kind, c.subject_qualified_name, c.update_kind, c.dimension,
                   c.statement, c.update_json, c.conditions_json, c.confidence, c.status,
                   c.validated_generation_id, c.last_checked_generation_id, c.tags_json,
                   c.created_utc, c.updated_utc,
                   s.agent_name, s.agent_model, s.agent_client,
                   current_entity.id
            FROM assessment_claims c
            JOIN analysis_sessions s ON s.id = c.session_id
            LEFT JOIN entities current_entity
                   ON current_entity.stable_key = c.subject_stable_key
                  AND current_entity.generation_id = $generation
            WHERE c.workspace_id = $workspaceId
              AND c.subject_stable_key IN ({{keyParameters}})
              AND c.status IN {{statuses}}
            ORDER BY CASE c.status WHEN 'accepted' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,
                     c.confidence DESC, c.updated_utc DESC
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$generation", workspace.Generation);
        command.Parameters.AddWithValue("$workspaceId", workspace.Id);
        // Freshness depends on current graph fingerprints, so scan beyond the requested
        // result count before stale claims are filtered out.
        var scanLimit = Math.Min(limit * 10, 5000);
        command.Parameters.AddWithValue("$limit", scanLimit);
        for (var index = 0; index < distinctKeys.Length; index++)
        {
            command.Parameters.AddWithValue($"$key{index}", distinctKeys[index]);
        }

        var rows = new List<AssessmentRow>();
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new AssessmentRow(
                    reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                    reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
                    reader.GetString(8), reader.GetString(9), reader.IsDBNull(10) ? null : reader.GetString(10),
                    reader.GetDouble(11), reader.GetString(12), reader.GetInt64(13), reader.GetInt64(14),
                    reader.GetString(15), reader.GetString(16), reader.GetString(17), reader.GetString(18),
                    reader.IsDBNull(19) ? null : reader.GetString(19),
                    reader.IsDBNull(20) ? null : reader.GetString(20),
                    reader.IsDBNull(21) ? null : reader.GetInt64(21)));
            }
        }

        var results = new List<AgentAssessmentDetail>();
        foreach (var row in rows)
        {
            var evidence = await ReadAssessmentEvidenceAsync(connection, row.ClaimId, cancellationToken);
            var staleReasons = await ReadStaleReasonsAsync(
                connection, workspace, row.ClaimId, cancellationToken);
            if (staleReasons.Count > 0 && !includeStale)
            {
                continue;
            }
            results.Add(new AgentAssessmentDetail(
                row.ClaimId,
                row.SessionId,
                row.ClientUpdateId,
                new AssessmentSubject(row.SubjectKey, row.SubjectKind, row.SubjectQualifiedName, row.CurrentEntityId),
                row.UpdateKind,
                row.Dimension,
                row.Statement,
                ParseJson(row.UpdateJson),
                row.ConditionsJson is null ? null : ParseJson(row.ConditionsJson),
                row.Confidence,
                row.Status,
                staleReasons.Count == 0 ? "current" : "stale",
                staleReasons,
                row.ValidatedGeneration,
                workspace.Generation,
                row.AgentName,
                row.AgentModel,
                row.AgentClient,
                JsonSerializer.Deserialize<string[]>(row.TagsJson, AssessmentJsonOptions) ?? [],
                evidence,
                DateTimeOffset.Parse(row.CreatedUtc),
                DateTimeOffset.Parse(row.UpdatedUtc)));
        }
        return results.Take(limit).ToArray();
    }

    private async Task<IReadOnlyList<string>> ReadStaleReasonsAsync(
        SqliteConnection connection,
        AssessmentWorkspace workspace,
        string claimId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT dependency_kind, stable_key, expected_value, details_json "
            + "FROM assessment_dependencies WHERE claim_id = $claimId ORDER BY dependency_kind, stable_key;";
        command.Parameters.AddWithValue("$claimId", claimId);
        var dependencies = new List<ResolvedDependency>();
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                dependencies.Add(new ResolvedDependency(
                    reader.GetString(0), reader.GetString(1), reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3)));
            }
        }
        var reasons = new List<string>();
        foreach (var dependency in dependencies)
        {
            var currentValue = await ReadCurrentDependencyValueAsync(
                connection, workspace, dependency, cancellationToken);
            if (!string.Equals(currentValue, dependency.ExpectedValue, StringComparison.Ordinal))
            {
                reasons.Add($"{dependency.Kind}:{dependency.StableKey} changed or is unavailable");
            }
        }
        return reasons;
    }

    private async Task<string?> ReadCurrentDependencyValueAsync(
        SqliteConnection connection,
        AssessmentWorkspace workspace,
        ResolvedDependency dependency,
        CancellationToken cancellationToken) => dependency.Kind switch
    {
        "entity" => await ReadEntityFingerprintAsync(
            connection, workspace.Generation, dependency.StableKey, cancellationToken),
        "file" => await ReadFileHashAsync(
            connection, workspace.Id, workspace.Generation, dependency.StableKey, cancellationToken),
        "relation" => await ReadRelationFingerprintAsync(
            connection, workspace.Id, workspace.Generation, dependency.StableKey, cancellationToken),
        "relation_id" => await RelationExistsAsync(
            connection, workspace.Id, workspace.Generation, long.Parse(dependency.StableKey), cancellationToken)
                ? "present" : null,
        "claim" => await AssessmentClaimExistsAsync(
            connection, workspace.Id, dependency.StableKey, cancellationToken) ? "present" : null,
        "analyzer" => await ReadAnalyzerVersionAsync(
            connection, workspace.Id, workspace.Generation, dependency.StableKey, cancellationToken),
        _ => null
    };

    private static async Task<IReadOnlyList<AssessmentEvidenceDetail>> ReadAssessmentEvidenceAsync(
        SqliteConnection connection,
        string claimId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT evidence_kind, summary FROM assessment_evidence WHERE claim_id = $claimId ORDER BY ordinal;";
        command.Parameters.AddWithValue("$claimId", claimId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var evidence = new List<AssessmentEvidenceDetail>();
        while (await reader.ReadAsync(cancellationToken))
        {
            evidence.Add(new AssessmentEvidenceDetail(reader.GetString(0), reader.GetString(1)));
        }
        return evidence;
    }

    private static async Task<AssessmentWorkspace?> ReadAssessmentWorkspaceAsync(
        SqliteConnection connection,
        string workspaceKey,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT id, current_generation_id FROM workspaces WHERE stable_key = $workspaceKey;";
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(1))
        {
            return null;
        }
        return new AssessmentWorkspace(reader.GetInt64(0), reader.GetInt64(1));
    }

    private static async Task<DecorateNodesResult?> ReadOperationReplayAsync(
        SqliteConnection connection,
        long workspaceId,
        string operationId,
        string payloadHash,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT payload_hash, result_json FROM analysis_sessions "
            + "WHERE workspace_id = $workspaceId AND operation_id = $operationId;";
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$operationId", operationId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }
        if (!string.Equals(reader.GetString(0), payloadHash, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"operationId {operationId} was already used with a different payload.");
        }
        if (reader.IsDBNull(1))
        {
            throw new InvalidOperationException($"operationId {operationId} is still being applied.");
        }
        return JsonSerializer.Deserialize<DecorateNodesResult>(reader.GetString(1), AssessmentJsonOptions)
            ?? throw new InvalidDataException("Stored decoration result is invalid.");
    }
}
