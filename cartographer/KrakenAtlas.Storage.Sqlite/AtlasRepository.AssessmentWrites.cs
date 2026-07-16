using System.Text.Json;
using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task InsertAnalysisSessionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        AssessmentWorkspace workspace,
        NodeDecorationBatch batch,
        string sessionId,
        string payloadHash,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(
            connection,
            transaction,
            """
            INSERT INTO analysis_sessions(
                id, workspace_id, atlas_generation_id, operation_id, payload_hash,
                agent_name, agent_model, agent_client, agent_client_version,
                purpose, task_fingerprint, scope_json, status, created_utc)
            VALUES (
                $id, $workspaceId, $generation, $operationId, $payloadHash,
                $agentName, $agentModel, $agentClient, $agentClientVersion,
                $purpose, $taskFingerprint, $scopeJson, 'applying', $createdUtc);
            """);
        command.Parameters.AddWithValue("$id", sessionId);
        command.Parameters.AddWithValue("$workspaceId", workspace.Id);
        command.Parameters.AddWithValue("$generation", workspace.Generation);
        command.Parameters.AddWithValue("$operationId", batch.OperationId);
        command.Parameters.AddWithValue("$payloadHash", payloadHash);
        command.Parameters.AddWithValue("$agentName", batch.Session.Agent.Name);
        command.Parameters.AddWithValue("$agentModel", DbValue(batch.Session.Agent.Model));
        command.Parameters.AddWithValue("$agentClient", DbValue(batch.Session.Agent.Client));
        command.Parameters.AddWithValue("$agentClientVersion", DbValue(batch.Session.Agent.ClientVersion));
        command.Parameters.AddWithValue("$purpose", batch.Session.Purpose);
        command.Parameters.AddWithValue("$taskFingerprint", DbValue(batch.Session.TaskFingerprint));
        command.Parameters.AddWithValue("$scopeJson", DbValue(batch.Session.Scope?.GetRawText()));
        command.Parameters.AddWithValue("$createdUtc", now.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertAssessmentAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        string sessionId,
        ResolvedDecoration item,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using (var command = CreateCommand(
            connection,
            transaction,
            """
            INSERT INTO assessment_claims(
                id, session_id, workspace_id, subject_stable_key, subject_kind,
                subject_qualified_name, validated_generation_id, last_checked_generation_id,
                client_update_id, update_kind, dimension, statement, update_json,
                conditions_json, confidence, requested_status, status, target_stable_key,
                group_key, tags_json, created_utc, updated_utc)
            VALUES (
                $id, $sessionId, $workspaceId, $subjectKey, $subjectKind,
                $subjectQualifiedName, $generation, $generation,
                $clientUpdateId, $updateKind, $dimension, $statement, $updateJson,
                $conditionsJson, $confidence, $requestedStatus, $status, $targetKey,
                $groupKey, $tagsJson, $createdUtc, $updatedUtc);
            """))
        {
            command.Parameters.AddWithValue("$id", item.ClaimId);
            command.Parameters.AddWithValue("$sessionId", sessionId);
            command.Parameters.AddWithValue("$workspaceId", workspaceId);
            command.Parameters.AddWithValue("$subjectKey", item.Subject.StableKey);
            command.Parameters.AddWithValue("$subjectKind", item.Subject.Kind);
            command.Parameters.AddWithValue("$subjectQualifiedName", item.Subject.QualifiedName);
            command.Parameters.AddWithValue("$generation", generation);
            command.Parameters.AddWithValue("$clientUpdateId", item.Decoration.ClientUpdateId);
            command.Parameters.AddWithValue("$updateKind", item.UpdateKind);
            command.Parameters.AddWithValue("$dimension", item.Dimension);
            command.Parameters.AddWithValue("$statement", item.Decoration.Statement);
            command.Parameters.AddWithValue("$updateJson", item.Decoration.Update.GetRawText());
            command.Parameters.AddWithValue("$conditionsJson", DbValue(item.Decoration.Conditions?.GetRawText()));
            command.Parameters.AddWithValue("$confidence", item.Decoration.Confidence);
            command.Parameters.AddWithValue("$requestedStatus", item.Decoration.RequestedStatus);
            command.Parameters.AddWithValue("$status", item.Status);
            command.Parameters.AddWithValue("$targetKey", DbValue(item.TargetStableKey));
            command.Parameters.AddWithValue("$groupKey", DbValue(item.GroupKey));
            command.Parameters.AddWithValue("$tagsJson", JsonSerializer.Serialize(item.Decoration.Tags ?? [], AssessmentJsonOptions));
            command.Parameters.AddWithValue("$createdUtc", now.ToString("O"));
            command.Parameters.AddWithValue("$updatedUtc", now.ToString("O"));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        for (var index = 0; index < item.Evidence.Count; index++)
        {
            var evidence = item.Evidence[index];
            await using var command = CreateCommand(
                connection,
                transaction,
                """
                INSERT INTO assessment_evidence(
                    claim_id, ordinal, evidence_kind, evidence_json, summary)
                VALUES ($claimId, $ordinal, $kind, $json, $summary);
                """);
            command.Parameters.AddWithValue("$claimId", item.ClaimId);
            command.Parameters.AddWithValue("$ordinal", index);
            command.Parameters.AddWithValue("$kind", evidence.Kind);
            command.Parameters.AddWithValue("$json", evidence.Json);
            command.Parameters.AddWithValue("$summary", evidence.Summary);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        foreach (var dependency in item.Dependencies)
        {
            await using var command = CreateCommand(
                connection,
                transaction,
                """
                INSERT INTO assessment_dependencies(
                    claim_id, dependency_kind, stable_key, expected_value, details_json)
                VALUES ($claimId, $kind, $stableKey, $expectedValue, $detailsJson);
                """);
            command.Parameters.AddWithValue("$claimId", item.ClaimId);
            command.Parameters.AddWithValue("$kind", dependency.Kind);
            command.Parameters.AddWithValue("$stableKey", dependency.StableKey);
            command.Parameters.AddWithValue("$expectedValue", dependency.ExpectedValue);
            command.Parameters.AddWithValue("$detailsJson", DbValue(dependency.DetailsJson));
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task ApplyAssessmentReviewAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        ResolvedDecoration item,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var superseded = item.Decoration.SupersedesClaimIds ?? [];
        foreach (var claimId in superseded)
        {
            await UpdatePriorClaimStatusAsync(
                connection, transaction, workspaceId, claimId, "superseded", now, cancellationToken);
        }
        if (item.UpdateKind != "review_assessment")
        {
            return;
        }
        var claim = RequiredString(item.Decoration.Update, "claimId", "/update");
        var action = RequiredString(item.Decoration.Update, "action", "/update");
        var status = action switch
        {
            "revalidate" => "accepted",
            "dispute" => "disputed",
            "reject" => "rejected",
            "supersede" => "superseded",
            _ => throw new InvalidDataException($"Unsupported review action: {action}.")
        };
        await UpdatePriorClaimStatusAsync(
            connection, transaction, workspaceId, claim, status, now, cancellationToken);
    }

    private static async Task UpdatePriorClaimStatusAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        string claimId,
        string status,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(
            connection,
            transaction,
            """
            UPDATE assessment_claims
            SET status = $status, updated_utc = $updatedUtc
            WHERE id = $claimId AND workspace_id = $workspaceId;
            """);
        command.Parameters.AddWithValue("$status", status);
        command.Parameters.AddWithValue("$updatedUtc", now.ToString("O"));
        command.Parameters.AddWithValue("$claimId", claimId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new InvalidDataException($"Claim {claimId} does not exist in this workspace.");
        }
    }
}
