using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task<ResolvedDependency> CreateEntityDependencyAsync(
        SqliteConnection connection,
        long generation,
        string stableKey,
        CancellationToken cancellationToken)
    {
        var fingerprint = await ReadEntityFingerprintAsync(connection, generation, stableKey, cancellationToken)
            ?? throw new InvalidDataException($"Entity dependency {stableKey} is not current.");
        return new ResolvedDependency("entity", stableKey, fingerprint, null);
    }

    private static async Task<string?> ReadEntityFingerprintAsync(
        SqliteConnection connection,
        long generation,
        string stableKey,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT e.kind, e.qualified_name, COALESCE(e.signature, ''),
                   COALESCE(group_concat(DISTINCT f.content_hash), '')
            FROM entities e
            LEFT JOIN entity_locations location
                   ON location.entity_id = e.id AND location.generation_id = $generation
            LEFT JOIN files f ON f.id = location.file_id
            WHERE e.stable_key = $stableKey AND e.generation_id = $generation
            GROUP BY e.id, e.kind, e.qualified_name, e.signature;
            """;
        command.Parameters.AddWithValue("$stableKey", stableKey);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? Hash($"{reader.GetString(0)}|{reader.GetString(1)}|{reader.GetString(2)}|{reader.GetString(3)}")
            : null;
    }

    private static async Task<AssessmentRelation?> ReadAssessmentRelationAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        long sourceId,
        long targetId,
        string relationKind,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT r.id, source.stable_key, target.stable_key, r.relation_domain,
                   r.relation_kind, COALESCE(r.dispatch_kind, ''), COALESCE(r.logical_scope, '')
            FROM relations r
            JOIN entities source ON source.id = r.source_entity_id
            JOIN entities target ON target.id = r.target_entity_id
            WHERE r.workspace_id = $workspaceId AND r.generation_id = $generation
              AND r.source_entity_id = $sourceId AND r.target_entity_id = $targetId
              AND r.relation_kind = $relationKind
            ORDER BY r.relation_domain
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$sourceId", sourceId);
        command.Parameters.AddWithValue("$targetId", targetId);
        command.Parameters.AddWithValue("$relationKind", relationKind);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }
        var details = JsonSerializer.Serialize(new
        {
            relationId = reader.GetInt64(0),
            sourceStableKey = reader.GetString(1),
            targetStableKey = reader.GetString(2),
            domain = reader.GetString(3),
            kind = reader.GetString(4)
        }, AssessmentJsonOptions);
        var fingerprint = Hash(
            $"{reader.GetString(1)}|{reader.GetString(2)}|{reader.GetString(3)}|{reader.GetString(4)}|{reader.GetString(5)}|{reader.GetString(6)}");
        return new AssessmentRelation(reader.GetInt64(0), fingerprint, details);
    }

    private static async Task<string?> ReadRelationFingerprintAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        string relationId,
        CancellationToken cancellationToken)
    {
        if (!long.TryParse(relationId, out var parsedId))
        {
            return null;
        }
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT source.stable_key, target.stable_key, r.relation_domain, r.relation_kind,
                   COALESCE(r.dispatch_kind, ''), COALESCE(r.logical_scope, '')
            FROM relations r
            JOIN entities source ON source.id = r.source_entity_id
            JOIN entities target ON target.id = r.target_entity_id
            WHERE r.id = $id AND r.workspace_id = $workspaceId AND r.generation_id = $generation;
            """;
        command.Parameters.AddWithValue("$id", parsedId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? Hash($"{reader.GetString(0)}|{reader.GetString(1)}|{reader.GetString(2)}|{reader.GetString(3)}|{reader.GetString(4)}|{reader.GetString(5)}")
            : null;
    }

    private static async Task<AssessmentFile> ResolveEvidenceFileAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        JsonElement evidence,
        string path,
        CancellationToken cancellationToken)
    {
        var relativePath = RequiredString(evidence, "path", path);
        var file = await ReadFileByPathAsync(connection, workspaceId, generation, relativePath, cancellationToken)
            ?? throw new InvalidDataException($"{path}/path does not resolve to a current Atlas file.");
        if (evidence.TryGetProperty("contentHash", out var hash)
            && hash.ValueKind == JsonValueKind.String
            && !string.Equals(hash.GetString(), file.ContentHash, StringComparison.Ordinal))
        {
            throw new InvalidDataException($"{path}/contentHash does not match the current file.");
        }
        return file;
    }

    private static async Task<AssessmentFile?> ReadFileByPathAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        string relativePath,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT stable_key, relative_path, content_hash
            FROM files
            WHERE workspace_id = $workspaceId AND generation_id = $generation
              AND lower(replace(relative_path, '\\', '/')) = lower(replace($relativePath, '\\', '/'))
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$relativePath", relativePath);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new AssessmentFile(reader.GetString(0), reader.GetString(1), reader.GetString(2))
            : null;
    }

    private static async Task<string?> ReadFileHashAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        string stableKey,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT content_hash FROM files WHERE stable_key = $stableKey "
            + "AND workspace_id = $workspaceId AND generation_id = $generation;";
        command.Parameters.AddWithValue("$stableKey", stableKey);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? null : Convert.ToString(result);
    }

    private static async Task<bool> AssessmentClaimExistsAsync(
        SqliteConnection connection,
        long workspaceId,
        string claimId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT 1 FROM assessment_claims WHERE id = $claimId AND workspace_id = $workspaceId;";
        command.Parameters.AddWithValue("$claimId", claimId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    private static async Task<bool> RelationExistsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        long relationId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT 1 FROM relations WHERE id = $id AND workspace_id = $workspaceId AND generation_id = $generation;";
        command.Parameters.AddWithValue("$id", relationId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    private static async Task<bool> AnalyzerVersionExistsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        string name,
        string version,
        CancellationToken cancellationToken) => string.Equals(
            await ReadAnalyzerVersionAsync(connection, workspaceId, generation, name, cancellationToken),
            version,
            StringComparison.Ordinal);

    private static async Task<string?> ReadAnalyzerVersionAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        string name,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT analyzer_version FROM analyzer_runs WHERE workspace_id = $workspaceId "
            + "AND generation_id = $generation AND analyzer = $name ORDER BY id DESC LIMIT 1;";
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$name", name);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? null : Convert.ToString(result);
    }
}
