using KrakenAtlas.Core;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<AtlasEntitySearchResult> SearchEntitiesAsync(
        string workspaceKey,
        string query,
        IReadOnlyList<string>? kinds = null,
        int limit = 25,
        CancellationToken cancellationToken = default)
    {
        query = query.Trim();
        if (query.Length == 0)
        {
            throw new ArgumentException("Entity search requires a non-empty query.", nameof(query));
        }
        if (limit is < 1 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Entity search limit must be between 1 and 100.");
        }

        var kindFilter = (kinds ?? [])
            .Select(kind => kind.Trim())
            .Where(kind => kind.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var generation = await ReadCurrentGenerationAsync(connection, workspaceKey, cancellationToken);
        if (generation is null)
        {
            return AtlasEntitySearchResult.NotCreated(query);
        }

        var filter = kindFilter.Length == 0
            ? string.Empty
            : $" AND e.kind IN ({string.Join(", ", kindFilter.Select((_, index) => $"$kind{index}"))})";
        await using var command = connection.CreateCommand();
        command.CommandText =
            $$"""
            SELECT e.id, e.stable_key, e.kind, e.name, e.qualified_name, e.language, e.signature,
                   p.name, p.relative_path,
                   f.stable_key, f.relative_path, location.location_kind,
                   location.start_line, location.start_column, location.end_line, location.end_column,
                   f.is_generated
            FROM entities e
            JOIN workspaces w ON w.id = e.workspace_id
            LEFT JOIN entity_locations location ON location.id = (
                SELECT candidate.id
                FROM entity_locations candidate
                JOIN files candidate_file ON candidate_file.id = candidate.file_id
                WHERE candidate.entity_id = e.id
                  AND candidate.generation_id = $generation
                ORDER BY candidate_file.relative_path, candidate.start_line, candidate.start_column
                LIMIT 1)
            LEFT JOIN files f ON f.id = location.file_id
            LEFT JOIN projects p ON p.id = f.project_id
            WHERE w.stable_key = $workspaceKey
              AND e.generation_id = $generation
              AND (instr(lower(e.name), lower($query)) > 0
                   OR instr(lower(e.qualified_name), lower($query)) > 0
                   OR instr(lower(COALESCE(e.signature, '')), lower($query)) > 0)
              {{filter}}
            ORDER BY
                CASE
                    WHEN lower(e.name) = lower($query) THEN 0
                    WHEN lower(e.qualified_name) = lower($query) THEN 1
                    WHEN instr(lower(e.name), lower($query)) = 1 THEN 2
                    ELSE 3
                END,
                length(e.qualified_name), e.qualified_name, e.kind
            LIMIT $resultLimit;
            """;
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation.Value);
        command.Parameters.AddWithValue("$query", query);
        command.Parameters.AddWithValue("$resultLimit", limit + 1);
        for (var index = 0; index < kindFilter.Length; index++)
        {
            command.Parameters.AddWithValue($"$kind{index}", kindFilter[index]);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var matches = new List<AtlasEntitySearchMatch>();
        while (await reader.ReadAsync(cancellationToken))
        {
            EntityLocationDetail? location = null;
            if (!reader.IsDBNull(9))
            {
                location = new EntityLocationDetail(
                    reader.GetString(9),
                    reader.GetString(10),
                    reader.GetString(11),
                    reader.GetInt32(12),
                    reader.GetInt32(13),
                    reader.GetInt32(14),
                    reader.GetInt32(15),
                    reader.GetInt32(16) != 0);
            }
            matches.Add(new AtlasEntitySearchMatch(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetString(7),
                reader.IsDBNull(8) ? null : reader.GetString(8),
                location));
        }
        var truncated = matches.Count > limit;
        return new AtlasEntitySearchResult(
            "current", generation, query, truncated, matches.Take(limit).ToArray());
    }
}
