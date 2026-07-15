using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static readonly string[] DefaultRelationDomains = ["code", "framework", "database"];

    public async Task<RelationQueryResult> GetRelationsAsync(
        string workspaceKey,
        string? stableKey,
        long? id,
        string direction = "both",
        IReadOnlyList<string>? domains = null,
        IReadOnlyList<string>? kinds = null,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        ValidateIdentity(stableKey, id, "Relation query");
        direction = direction.Trim().ToLowerInvariant();
        if (direction is not ("incoming" or "outgoing" or "both"))
        {
            throw new ArgumentOutOfRangeException(nameof(direction), "Direction must be incoming, outgoing, or both.");
        }
        if (limit is < 1 or > 200)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Relation query limit must be between 1 and 200.");
        }

        var domainFilter = NormalizeFilter(domains, DefaultRelationDomains);
        var kindFilter = NormalizeFilter(kinds, []);
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var generation = await ReadCurrentGenerationAsync(connection, workspaceKey, cancellationToken);
        if (generation is null)
        {
            return RelationQueryResult.NotCreated(direction);
        }
        var focus = await ReadRelationEntityAsync(
            connection,
            workspaceKey,
            generation.Value,
            stableKey,
            id,
            cancellationToken);
        if (focus is null)
        {
            return RelationQueryResult.EntityNotFound(generation.Value, direction);
        }

        var directionPredicate = direction switch
        {
            "incoming" => "r.target_entity_id = $focusId",
            "outgoing" => "r.source_entity_id = $focusId",
            _ => "(r.source_entity_id = $focusId OR r.target_entity_id = $focusId)"
        };
        await using var command = connection.CreateCommand();
        command.CommandText = BuildRelationSelect(
            $"{directionPredicate} AND {BuildFilter("r.relation_domain", "domain", domainFilter.Length)}"
            + (kindFilter.Length == 0 ? string.Empty : $" AND {BuildFilter("r.relation_kind", "kind", kindFilter.Length)}"),
            "ORDER BY r.relation_domain, r.relation_kind, source.qualified_name, target.qualified_name, evidence.start_line",
            "$resultLimit");
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation.Value);
        command.Parameters.AddWithValue("$focusId", focus.Id);
        command.Parameters.AddWithValue("$resultLimit", limit + 1);
        AddFilterParameters(command, "domain", domainFilter);
        AddFilterParameters(command, "kind", kindFilter);

        var relations = await ReadRelationsAsync(command, cancellationToken);
        var truncated = relations.Count > limit;
        return new RelationQueryResult(
            "current",
            generation,
            focus,
            direction,
            truncated,
            relations.Take(limit).ToArray());
    }

    public async Task<RouteQueryResult> TraceRouteAsync(
        string workspaceKey,
        string? sourceStableKey,
        long? sourceId,
        string? targetStableKey,
        long? targetId,
        IReadOnlyList<string>? viaStableKeys = null,
        IReadOnlyList<string>? domains = null,
        IReadOnlyList<string>? kinds = null,
        int maxDepth = 8,
        int maxVisited = 5000,
        CancellationToken cancellationToken = default)
    {
        ValidateIdentity(sourceStableKey, sourceId, "Route source");
        ValidateIdentity(targetStableKey, targetId, "Route target");
        if (maxDepth is < 1 or > 16)
        {
            throw new ArgumentOutOfRangeException(nameof(maxDepth), "Route maxDepth must be between 1 and 16.");
        }
        if (maxVisited is < 10 or > 20000)
        {
            throw new ArgumentOutOfRangeException(nameof(maxVisited), "Route maxVisited must be between 10 and 20000.");
        }

        var domainFilter = NormalizeFilter(domains, DefaultRelationDomains);
        var kindFilter = NormalizeFilter(kinds, []);
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var generation = await ReadCurrentGenerationAsync(connection, workspaceKey, cancellationToken);
        if (generation is null)
        {
            return RouteQueryResult.NotCreated(maxDepth);
        }
        var source = await ReadRelationEntityAsync(
            connection, workspaceKey, generation.Value, sourceStableKey, sourceId, cancellationToken);
        var target = await ReadRelationEntityAsync(
            connection, workspaceKey, generation.Value, targetStableKey, targetId, cancellationToken);
        if (source is null || target is null)
        {
            return RouteQueryResult.EntityNotFound(generation.Value, source, target, maxDepth);
        }
        var waypoints = new List<RelationEntity>();
        foreach (var viaStableKey in NormalizeFilter(viaStableKeys, []))
        {
            var waypoint = await ReadRelationEntityAsync(
                connection, workspaceKey, generation.Value, viaStableKey, null, cancellationToken);
            if (waypoint is null)
            {
                return RouteQueryResult.EntityNotFound(generation.Value, source, target, maxDepth);
            }
            waypoints.Add(waypoint);
        }
        if (source.Id == target.Id && waypoints.Count == 0)
        {
            return new RouteQueryResult(
                "current", generation, source, target, [], true, false, maxDepth, 1, []);
        }

        var edgeLimit = Math.Max(1000, maxVisited * 20);
        await using var command = connection.CreateCommand();
        command.CommandText = BuildRelationSelect(
            BuildFilter("r.relation_domain", "domain", domainFilter.Length)
            + (kindFilter.Length == 0
                ? " AND r.relation_kind <> 'contains'"
                : $" AND {BuildFilter("r.relation_kind", "kind", kindFilter.Length)}"),
            "ORDER BY r.id",
            "$edgeLimit");
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation.Value);
        command.Parameters.AddWithValue("$edgeLimit", edgeLimit + 1);
        AddFilterParameters(command, "domain", domainFilter);
        AddFilterParameters(command, "kind", kindFilter);
        var loaded = await ReadRelationsAsync(command, cancellationToken);
        var graphTruncated = loaded.Count > edgeLimit;
        var edges = loaded.Take(edgeLimit).ToArray();
        var outgoing = edges
            .GroupBy(edge => edge.Source.Id)
            .ToDictionary(group => group.Key, group => group.ToArray());

        var routeEntities = new[] { source }.Concat(waypoints).Append(target).ToArray();
        var path = new List<AtlasRelationMatch>();
        var visited = new HashSet<long>();
        var found = true;
        for (var segmentIndex = 0; segmentIndex < routeEntities.Length - 1; segmentIndex++)
        {
            var remainingDepth = maxDepth - path.Count;
            var remainingVisited = maxVisited - visited.Count;
            if (remainingDepth <= 0 || remainingVisited <= 0)
            {
                found = false;
                break;
            }

            var segment = FindRouteSegment(
                routeEntities[segmentIndex].Id,
                routeEntities[segmentIndex + 1].Id,
                outgoing,
                remainingDepth,
                remainingVisited,
                cancellationToken);
            visited.UnionWith(segment.VisitedEntityIds);
            if (!segment.Found)
            {
                found = false;
                break;
            }
            path.AddRange(segment.Edges);
        }
        if (!found)
        {
            path.Clear();
        }
        return new RouteQueryResult(
            "current",
            generation,
            source,
            target,
            waypoints,
            found,
            graphTruncated,
            maxDepth,
            visited.Count,
            path.Select((edge, index) => new RouteStep(index + 1, edge)).ToArray());
    }

    private static RouteSegment FindRouteSegment(
        long sourceId,
        long targetId,
        IReadOnlyDictionary<long, AtlasRelationMatch[]> outgoing,
        int maxDepth,
        int maxVisited,
        CancellationToken cancellationToken)
    {
        if (sourceId == targetId)
        {
            return new RouteSegment(true, new HashSet<long> { sourceId }, []);
        }

        var queue = new Queue<(long EntityId, int Depth)>();
        var visited = new HashSet<long> { sourceId };
        var parent = new Dictionary<long, AtlasRelationMatch>();
        queue.Enqueue((sourceId, 0));
        var found = false;
        while (queue.Count > 0 && visited.Count < maxVisited && !found)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var (entityId, depth) = queue.Dequeue();
            if (depth >= maxDepth || !outgoing.TryGetValue(entityId, out var candidates))
            {
                continue;
            }
            foreach (var edge in candidates)
            {
                if (!visited.Add(edge.Target.Id))
                {
                    continue;
                }
                parent[edge.Target.Id] = edge;
                if (edge.Target.Id == targetId)
                {
                    found = true;
                    break;
                }
                queue.Enqueue((edge.Target.Id, depth + 1));
                if (visited.Count >= maxVisited)
                {
                    break;
                }
            }
        }

        var path = new List<AtlasRelationMatch>();
        if (found)
        {
            var cursor = targetId;
            while (cursor != sourceId)
            {
                var edge = parent[cursor];
                path.Add(edge);
                cursor = edge.Source.Id;
            }
            path.Reverse();
        }
        return new RouteSegment(found, visited, path);
    }

    private sealed record RouteSegment(
        bool Found,
        IReadOnlySet<long> VisitedEntityIds,
        IReadOnlyList<AtlasRelationMatch> Edges);

    private static async Task<long?> ReadCurrentGenerationAsync(
        SqliteConnection connection,
        string workspaceKey,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT current_generation_id FROM workspaces WHERE stable_key = $workspaceKey;";
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is null or DBNull ? null : Convert.ToInt64(value);
    }

    private static async Task<RelationEntity?> ReadRelationEntityAsync(
        SqliteConnection connection,
        string workspaceKey,
        long generation,
        string? stableKey,
        long? id,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
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
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$stableKey", DbValue(stableKey));
        command.Parameters.AddWithValue("$id", DbValue(id));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadEntity(reader, 0) : null;
    }

    private static string BuildRelationSelect(string predicate, string orderBy, string limit) =>
        $$"""
        SELECT r.id,
               source.id, source.stable_key, source.kind, source.name, source.qualified_name, source.signature,
               target.id, target.stable_key, target.kind, target.name, target.qualified_name, target.signature,
               r.relation_domain, r.relation_kind, r.dispatch_kind, r.logical_scope,
               p.name, p.relative_path,
               f.stable_key, f.relative_path,
               evidence.start_line, evidence.start_column, evidence.end_line, evidence.end_column,
               f.is_generated
        FROM relations r
        JOIN workspaces w ON w.id = r.workspace_id
        JOIN entities source ON source.id = r.source_entity_id
        JOIN entities target ON target.id = r.target_entity_id
        JOIN relation_evidence evidence ON evidence.id = (
            SELECT candidate.id
            FROM relation_evidence candidate
            WHERE candidate.relation_id = r.id
              AND candidate.generation_id = $generation
            ORDER BY candidate.start_line, candidate.start_column
            LIMIT 1)
        JOIN files f ON f.id = evidence.file_id
        LEFT JOIN projects p ON p.id = f.project_id
        WHERE w.stable_key = $workspaceKey
          AND r.generation_id = $generation
          AND {{predicate}}
        {{orderBy}}
        LIMIT {{limit}};
        """;

    private static async Task<List<AtlasRelationMatch>> ReadRelationsAsync(
        SqliteCommand command,
        CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var relations = new List<AtlasRelationMatch>();
        while (await reader.ReadAsync(cancellationToken))
        {
            relations.Add(new AtlasRelationMatch(
                reader.GetInt64(0),
                ReadEntity(reader, 1),
                ReadEntity(reader, 7),
                reader.GetString(13),
                reader.GetString(14),
                reader.IsDBNull(15) ? null : reader.GetString(15),
                reader.IsDBNull(16) ? null : reader.GetString(16),
                reader.IsDBNull(17) ? null : reader.GetString(17),
                reader.IsDBNull(18) ? null : reader.GetString(18),
                new EntityLocationDetail(
                    reader.GetString(19),
                    reader.GetString(20),
                    "evidence",
                    reader.GetInt32(21),
                    reader.GetInt32(22),
                    reader.GetInt32(23),
                    reader.GetInt32(24),
                    reader.GetInt32(25) != 0)));
        }
        return relations;
    }

    private static RelationEntity ReadEntity(SqliteDataReader reader, int offset) => new(
        reader.GetInt64(offset),
        reader.GetString(offset + 1),
        reader.GetString(offset + 2),
        reader.GetString(offset + 3),
        reader.GetString(offset + 4),
        reader.IsDBNull(offset + 5) ? null : reader.GetString(offset + 5));

    private static void ValidateIdentity(string? stableKey, long? id, string label)
    {
        if (string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException($"{label} requires stableKey or id.");
        }
        if (!string.IsNullOrWhiteSpace(stableKey) && id is not null)
        {
            throw new ArgumentException($"{label} accepts stableKey or id, not both.");
        }
    }

    private static string[] NormalizeFilter(IReadOnlyList<string>? values, IReadOnlyList<string> defaults)
    {
        var normalized = (values ?? [])
            .Select(value => value.Trim())
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        return normalized.Length > 0
            ? normalized
            : defaults
                .Select(value => value.Trim())
                .Where(value => value.Length > 0)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
    }

    private static string BuildFilter(string column, string prefix, int count) =>
        $"{column} IN ({string.Join(", ", Enumerable.Range(0, count).Select(index => $"${prefix}{index}"))})";

    private static void AddFilterParameters(SqliteCommand command, string prefix, IReadOnlyList<string> values)
    {
        for (var index = 0; index < values.Count; index++)
        {
            command.Parameters.AddWithValue($"${prefix}{index}", values[index]);
        }
    }
}
