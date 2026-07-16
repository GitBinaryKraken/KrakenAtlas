using KrakenAtlas.Core;
using System.Text.RegularExpressions;

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
        var terms = ExtractEntitySearchTerms(query);
        var matchPredicate = string.Join(
            " OR ",
            terms.Select((_, index) => BuildEntitySearchMatch($"$term{index}")));
        var scoreExpression = string.Join(
            " + ",
            terms.Select((_, index) => BuildEntitySearchScore(
                $"$term{index}", index == 0 && terms.Length > 1 ? 2 : 1)));
        await using var command = connection.CreateCommand();
        command.CommandText =
            $$"""
            SELECT e.id, e.stable_key, e.kind, e.name, e.qualified_name, e.language, e.signature,
                   p.name, p.relative_path,
                   f.stable_key, f.relative_path, location.location_kind,
                   location.start_line, location.start_column, location.end_line, location.end_column,
                   f.is_generated,
                   ({{scoreExpression}}) AS search_score
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
              AND ({{matchPredicate}})
              {{filter}}
            ORDER BY
                search_score DESC,
                COALESCE(f.is_generated, 0),
                length(e.qualified_name), e.qualified_name, e.kind
            LIMIT $resultLimit;
            """;
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation.Value);
        command.Parameters.AddWithValue("$resultLimit", limit + 1);
        for (var index = 0; index < terms.Length; index++)
        {
            command.Parameters.AddWithValue($"$term{index}", terms[index]);
        }
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

    private static string[] ExtractEntitySearchTerms(string query)
    {
        var terms = new List<string> { query };
        if (query.Any(char.IsWhiteSpace))
        {
            terms.AddRange(Regex.Matches(query, "[A-Za-z_][A-Za-z0-9_.:/-]*")
                .Select(match => match.Value)
                .Where(value => value.Length >= 2));
        }
        return terms
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToArray();
    }

    private static string BuildEntitySearchMatch(string parameter) =>
        $"instr(lower(e.name), lower({parameter})) > 0"
        + $" OR instr(lower(e.qualified_name), lower({parameter})) > 0"
        + $" OR instr(lower(COALESCE(e.signature, '')), lower({parameter})) > 0"
        + $" OR instr(lower(replace(e.kind, '_', ' ')), lower({parameter})) > 0"
        + $" OR instr(lower(replace(e.kind, '_', ' ') || 's'), lower({parameter})) > 0"
        + $" OR instr(lower(COALESCE(e.language, '')), lower({parameter})) > 0"
        + $" OR instr(lower(COALESCE(p.name, '')), lower({parameter})) > 0"
        + $" OR instr(lower(COALESCE(p.relative_path, '')), lower({parameter})) > 0"
        + $" OR instr(lower(COALESCE(f.relative_path, '')), lower({parameter})) > 0";

    private static string BuildEntitySearchScore(string parameter, int multiplier) =>
        $"({multiplier} * ("
        + $"CASE WHEN lower(e.name) = lower({parameter}) THEN 120 "
        + $"WHEN lower(e.qualified_name) = lower({parameter}) THEN 110 "
        + $"WHEN instr(lower(e.name), lower({parameter})) = 1 THEN 80 "
        + $"WHEN instr(lower(e.name), lower({parameter})) > 0 THEN 65 "
        + $"WHEN instr(lower(e.qualified_name), lower({parameter})) > 0 THEN 55 "
        + $"WHEN instr(lower(COALESCE(e.signature, '')), lower({parameter})) > 0 THEN 45 "
        + $"WHEN instr(lower(replace(e.kind, '_', ' ') || 's'), lower({parameter})) > 0 THEN 35 "
        + $"WHEN instr(lower(COALESCE(e.language, '')), lower({parameter})) > 0 THEN 20 ELSE 0 END "
        + $"+ CASE WHEN lower(COALESCE(p.name, '')) = lower({parameter}) THEN 70 "
        + $"WHEN instr(lower(COALESCE(p.relative_path, '')), lower({parameter})) > 0 THEN 45 ELSE 0 END "
        + $"+ CASE WHEN lower(COALESCE(f.relative_path, '')) = lower({parameter}) THEN 50 "
        + $"WHEN instr(lower(COALESCE(f.relative_path, '')), lower({parameter})) > 0 THEN 30 ELSE 0 END))";
}
