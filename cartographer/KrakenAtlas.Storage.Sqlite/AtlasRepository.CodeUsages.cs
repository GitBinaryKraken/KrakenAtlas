using KrakenAtlas.Core;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<CodeUsageResult> FindCodeUsagesAsync(
        string workspaceKey,
        string? stableKey,
        long? id,
        IReadOnlyList<string>? kinds = null,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("Code usage lookup requires stableKey or id.");
        }
        if (!string.IsNullOrWhiteSpace(stableKey) && id is not null)
        {
            throw new ArgumentException("Code usage lookup accepts stableKey or id, not both.");
        }
        if (limit is < 1 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Code usage limit must be between 1 and 100.");
        }

        var relationKinds = (kinds ?? [])
            .Select(kind => kind.Trim())
            .Where(kind => kind.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        await using var generationCommand = connection.CreateCommand();
        generationCommand.CommandText =
            "SELECT current_generation_id FROM workspaces WHERE stable_key = $workspaceKey;";
        generationCommand.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        var generationValue = await generationCommand.ExecuteScalarAsync(cancellationToken);
        if (generationValue is null or DBNull)
        {
            return CodeUsageResult.NotCreated();
        }
        var generation = Convert.ToInt64(generationValue);

        await using var targetCommand = connection.CreateCommand();
        targetCommand.CommandText =
            """
            SELECT e.id, e.stable_key, e.kind, e.name, e.qualified_name, e.signature
            FROM entities e
            JOIN workspaces w ON w.id = e.workspace_id
            WHERE w.stable_key = $workspaceKey
              AND e.generation_id = $generation
              AND (($stableKey IS NOT NULL AND e.stable_key = $stableKey)
                   OR ($id IS NOT NULL AND e.id = $id))
            LIMIT 1;
            """;
        targetCommand.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        targetCommand.Parameters.AddWithValue("$generation", generation);
        targetCommand.Parameters.AddWithValue("$stableKey", DbValue(stableKey));
        targetCommand.Parameters.AddWithValue("$id", DbValue(id));
        await using var targetReader = await targetCommand.ExecuteReaderAsync(cancellationToken);
        if (!await targetReader.ReadAsync(cancellationToken))
        {
            return CodeUsageResult.TargetNotFound(generation);
        }
        var target = new CodeUsageTarget(
            targetReader.GetInt64(0),
            targetReader.GetString(1),
            targetReader.GetString(2),
            targetReader.GetString(3),
            targetReader.GetString(4),
            targetReader.IsDBNull(5) ? null : targetReader.GetString(5));
        await targetReader.CloseAsync();

        var kindFilter = relationKinds.Length == 0
            ? string.Empty
            : $" AND r.relation_kind IN ({string.Join(", ", relationKinds.Select((_, index) => $"$kind{index}"))})";
        await using var command = connection.CreateCommand();
        command.CommandText =
            $$"""
            SELECT source.id, source.stable_key, source.kind, source.name,
                   source.qualified_name, source.signature,
                   r.relation_kind, r.dispatch_kind,
                   p.name, p.relative_path,
                   f.stable_key, f.relative_path,
                   evidence.start_line, evidence.start_column,
                   evidence.end_line, evidence.end_column,
                   f.is_generated
            FROM relations r
            JOIN entities source ON source.id = r.source_entity_id
            JOIN relation_evidence evidence ON evidence.relation_id = r.id
                AND evidence.generation_id = $generation
            JOIN files f ON f.id = evidence.file_id
            LEFT JOIN projects p ON p.id = f.project_id
            WHERE r.workspace_id = (
                    SELECT id FROM workspaces WHERE stable_key = $workspaceKey)
              AND r.generation_id = $generation
              AND r.target_entity_id = $targetId
              AND r.relation_domain = 'code'
              AND r.relation_kind <> 'contains'
              {{kindFilter}}
            ORDER BY f.relative_path, evidence.start_line, evidence.start_column,
                     source.qualified_name, r.relation_kind
            LIMIT $resultLimit;
            """;
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$targetId", target.Id);
        command.Parameters.AddWithValue("$resultLimit", limit + 1);
        for (var index = 0; index < relationKinds.Length; index++)
        {
            command.Parameters.AddWithValue($"$kind{index}", relationKinds[index]);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var usages = new List<CodeUsageMatch>();
        while (await reader.ReadAsync(cancellationToken))
        {
            usages.Add(new CodeUsageMatch(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetString(7),
                reader.IsDBNull(8) ? null : reader.GetString(8),
                reader.IsDBNull(9) ? null : reader.GetString(9),
                new EntityLocationDetail(
                    reader.GetString(10),
                    reader.GetString(11),
                    "usage",
                    reader.GetInt32(12),
                    reader.GetInt32(13),
                    reader.GetInt32(14),
                    reader.GetInt32(15),
                    reader.GetInt32(16) != 0)));
        }

        var truncated = usages.Count > limit;
        return new CodeUsageResult(
            "current",
            generation,
            target,
            truncated,
            usages.Take(limit).ToArray());
    }
}
