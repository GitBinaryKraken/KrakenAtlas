using KrakenAtlas.Core;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<SymbolSearchResult> SearchSymbolsAsync(
        string workspaceKey,
        string query,
        int limit = 25,
        CancellationToken cancellationToken = default)
    {
        query = query.Trim();
        if (query.Length == 0)
        {
            throw new ArgumentException("Symbol search requires a non-empty query.", nameof(query));
        }
        if (limit is < 1 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Symbol search limit must be between 1 and 100.");
        }

        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        await using var generationCommand = connection.CreateCommand();
        generationCommand.CommandText =
            "SELECT current_generation_id FROM workspaces WHERE stable_key = $workspaceKey;";
        generationCommand.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        var generationValue = await generationCommand.ExecuteScalarAsync(cancellationToken);
        if (generationValue is null or DBNull)
        {
            return SymbolSearchResult.NotCreated(query);
        }
        var generation = Convert.ToInt64(generationValue);

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT e.id, e.stable_key, e.kind, e.name, e.qualified_name, e.signature,
                   p.name, p.relative_path,
                   (SELECT COUNT(*)
                    FROM entity_locations definitions
                    WHERE definitions.entity_id = e.id
                      AND definitions.generation_id = $generation
                      AND definitions.location_kind = 'definition') AS definition_count,
                   f.stable_key, f.relative_path, first_definition.location_kind,
                   first_definition.start_line, first_definition.start_column,
                   first_definition.end_line, first_definition.end_column,
                   f.is_generated
            FROM entities e
            JOIN workspaces w ON w.id = e.workspace_id
            LEFT JOIN entity_locations first_definition ON first_definition.id = (
                SELECT candidate.id
                FROM entity_locations candidate
                JOIN files candidate_file ON candidate_file.id = candidate.file_id
                WHERE candidate.entity_id = e.id
                  AND candidate.generation_id = $generation
                  AND candidate.location_kind = 'definition'
                ORDER BY candidate_file.relative_path, candidate.start_line, candidate.start_column
                LIMIT 1)
            LEFT JOIN files f ON f.id = first_definition.file_id
            LEFT JOIN projects p ON p.id = f.project_id
            WHERE w.stable_key = $workspaceKey
              AND e.generation_id = $generation
              AND e.stable_key LIKE 'csharp_symbol:%'
              AND (instr(lower(e.name), lower($query)) > 0
                   OR instr(lower(e.qualified_name), lower($query)) > 0)
            ORDER BY
                CASE
                    WHEN lower(e.name) = lower($query) THEN 0
                    WHEN instr(lower(e.name), lower($query)) = 1 THEN 1
                    ELSE 2
                END,
                length(e.qualified_name),
                e.qualified_name,
                e.kind
            LIMIT $resultLimit;
            """;
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$query", query);
        command.Parameters.AddWithValue("$resultLimit", limit + 1);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var matches = new List<SymbolSearchMatch>();
        while (await reader.ReadAsync(cancellationToken))
        {
            EntityLocationDetail? definition = null;
            if (!reader.IsDBNull(9))
            {
                definition = new EntityLocationDetail(
                    reader.GetString(9),
                    reader.GetString(10),
                    reader.GetString(11),
                    reader.GetInt32(12),
                    reader.GetInt32(13),
                    reader.GetInt32(14),
                    reader.GetInt32(15),
                    reader.GetInt32(16) != 0);
            }

            matches.Add(new SymbolSearchMatch(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetString(7),
                reader.GetInt32(8),
                definition));
        }

        var truncated = matches.Count > limit;
        return new SymbolSearchResult(
            "current",
            generation,
            query,
            truncated,
            matches.Take(limit).ToArray());
    }
}
