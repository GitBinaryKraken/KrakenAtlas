using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<ChangeSurfaceResult> GetChangeSurfaceAsync(
        string workspaceKey,
        string? stableKey,
        long? id,
        IReadOnlyList<string>? domains = null,
        IReadOnlyList<string>? kinds = null,
        int maxDepth = 3,
        int maxEntities = 200,
        CancellationToken cancellationToken = default)
    {
        ValidateIdentity(stableKey, id, "Change-surface seed");
        if (maxDepth is < 1 or > 8)
        {
            throw new ArgumentOutOfRangeException(nameof(maxDepth),
                "Change-surface maxDepth must be between 1 and 8.");
        }
        if (maxEntities is < 10 or > 1000)
        {
            throw new ArgumentOutOfRangeException(nameof(maxEntities),
                "Change-surface maxEntities must be between 10 and 1000.");
        }

        var domainFilter = NormalizeFilter(domains, DefaultRelationDomains);
        var kindFilter = NormalizeFilter(kinds, []);
        var useDefaultExpansionProfile = kindFilter.Length == 0;
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var generation = await ReadCurrentGenerationAsync(connection, workspaceKey, cancellationToken);
        if (generation is null)
        {
            return ChangeSurfaceResult.NotCreated(maxDepth, maxEntities);
        }

        var seed = await ReadRelationEntityAsync(
            connection, workspaceKey, generation.Value, stableKey, id, cancellationToken);
        if (seed is null)
        {
            return ChangeSurfaceResult.EntityNotFound(generation.Value, maxDepth, maxEntities);
        }

        var edgeLimit = Math.Max(5000, maxEntities * 100);
        await using var relationCommand = connection.CreateCommand();
        relationCommand.CommandText = BuildRelationSelect(
            BuildFilter("r.relation_domain", "domain", domainFilter.Length)
            + (kindFilter.Length == 0
                ? " AND r.relation_kind <> 'contains'"
                : $" AND {BuildFilter("r.relation_kind", "kind", kindFilter.Length)}"),
            "ORDER BY r.id",
            "$edgeLimit");
        relationCommand.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        relationCommand.Parameters.AddWithValue("$generation", generation.Value);
        relationCommand.Parameters.AddWithValue("$edgeLimit", edgeLimit + 1);
        AddFilterParameters(relationCommand, "domain", domainFilter);
        AddFilterParameters(relationCommand, "kind", kindFilter);
        var loaded = await ReadRelationsAsync(relationCommand, cancellationToken);
        var graphTruncated = loaded.Count > edgeLimit;
        var adjacency = BuildChangeSurfaceAdjacency(loaded.Take(edgeLimit));

        var queue = new Queue<(long EntityId, int Depth)>();
        var visited = new HashSet<long> { seed.Id };
        var discovered = new List<DiscoveredSurfaceItem>();
        var truncated = false;
        queue.Enqueue((seed.Id, 0));
        while (queue.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var (entityId, depth) = queue.Dequeue();
            if (depth >= maxDepth || !adjacency.TryGetValue(entityId, out var candidates))
            {
                continue;
            }

            foreach (var candidate in candidates)
            {
                if (visited.Contains(candidate.Entity.Id))
                {
                    continue;
                }
                if (depth > 0
                    && useDefaultExpansionProfile
                    && IsHighFanoutCodeRelation(candidate.Relation))
                {
                    continue;
                }
                if (discovered.Count >= maxEntities)
                {
                    truncated = true;
                    break;
                }

                visited.Add(candidate.Entity.Id);
                var itemDepth = depth + 1;
                discovered.Add(new DiscoveredSurfaceItem(
                    candidate.Entity,
                    itemDepth,
                    candidate.PathDirection,
                    candidate.Relation));
                if (!useDefaultExpansionProfile || !IsHighFanoutCodeRelation(candidate.Relation))
                {
                    queue.Enqueue((candidate.Entity.Id, itemDepth));
                }
            }
            if (truncated)
            {
                break;
            }
        }

        var entityIds = discovered.Select(item => item.Entity.Id).Prepend(seed.Id).ToArray();
        var projectsByEntity = await ReadChangeSurfaceProjectsAsync(
            connection, generation.Value, entityIds, cancellationToken);
        var items = discovered
            .Select(item => new ChangeSurfaceItem(
                item.Entity,
                item.Depth,
                item.PathDirection,
                item.ViaRelation,
                projectsByEntity.GetValueOrDefault(item.Entity.Id)))
            .OrderBy(item => item.Depth)
            .ThenBy(item => item.Project?.RelativePath, StringComparer.Ordinal)
            .ThenBy(item => item.Entity.QualifiedName, StringComparer.Ordinal)
            .ToArray();
        var affectedProjects = projectsByEntity.Values
            .DistinctBy(project => project.StableKey)
            .OrderByDescending(project => project.IsTest)
            .ThenBy(project => project.RelativePath, StringComparer.Ordinal)
            .ToArray();
        var verificationCommands = await ReadChangeSurfaceCommandsAsync(
            connection,
            generation.Value,
            affectedProjects.Select(project => project.StableKey).ToArray(),
            cancellationToken);
        var explicitTests = items.Where(item => item.Entity.Kind == "test_case").ToArray();
        var relatedTests = explicitTests.Length > 0
            ? explicitTests
            : items.Where(item =>
                item.Project?.IsTest == true
                && item.Entity.Kind == "method"
                && item.PathDirection == "dependent").ToArray();

        return new ChangeSurfaceResult(
            "current",
            generation,
            seed,
            projectsByEntity.GetValueOrDefault(seed.Id),
            truncated,
            graphTruncated,
            maxDepth,
            maxEntities,
            items.Where(item => item.Depth == 1).ToArray(),
            items.Where(item => item.Depth > 1 && item.Project?.IsTest != true).ToArray(),
            relatedTests,
            affectedProjects,
            verificationCommands);
    }

    private static Dictionary<long, ChangeSurfaceNeighbor[]> BuildChangeSurfaceAdjacency(
        IEnumerable<AtlasRelationMatch> relations)
    {
        var adjacency = new Dictionary<long, List<ChangeSurfaceNeighbor>>();
        foreach (var relation in relations)
        {
            Add(relation.Source.Id, new ChangeSurfaceNeighbor(
                relation.Target, "dependency", relation));
            Add(relation.Target.Id, new ChangeSurfaceNeighbor(
                relation.Source, "dependent", relation));
        }
        return adjacency.ToDictionary(
            pair => pair.Key,
            pair => pair.Value
                .OrderBy(item => item.Relation.RelationId)
                .ToArray());

        void Add(long entityId, ChangeSurfaceNeighbor neighbor)
        {
            if (!adjacency.TryGetValue(entityId, out var values))
            {
                values = [];
                adjacency[entityId] = values;
            }
            values.Add(neighbor);
        }
    }

    private static bool IsHighFanoutCodeRelation(AtlasRelationMatch relation) =>
        relation.Domain == "code" && relation.Kind is "reads" or "writes" or "uses_type";

    private static async Task<Dictionary<long, ChangeSurfaceProject>> ReadChangeSurfaceProjectsAsync(
        SqliteConnection connection,
        long generation,
        IReadOnlyList<long> entityIds,
        CancellationToken cancellationToken)
    {
        if (entityIds.Count == 0)
        {
            return [];
        }

        await using var command = connection.CreateCommand();
        var parameters = string.Join(", ", entityIds.Select((_, index) => $"$entity{index}"));
        command.CommandText =
            $$"""
            WITH RECURSIVE ownership(entity_id, ancestor_id) AS (
                SELECT id, id
                FROM entities
                WHERE generation_id = $generation AND id IN ({{parameters}})
                UNION ALL
                SELECT ownership.entity_id, parent.id
                FROM ownership
                JOIN entities current ON current.id = ownership.ancestor_id
                JOIN entities parent ON parent.id = current.containing_entity_id
                WHERE parent.generation_id = $generation
            )
            SELECT ownership.entity_id, project.stable_key, project.name, project.relative_path,
                   project.project_kind,
                   CASE WHEN project.project_kind = 'test'
                          OR EXISTS (
                              SELECT 1 FROM project_facets facet
                              WHERE facet.project_id = project.id
                                AND facet.generation_id = $generation
                                AND facet.facet = 'test')
                        THEN 1 ELSE 0 END
            FROM ownership
            JOIN entities project_entity ON project_entity.id = ownership.ancestor_id
                                        AND project_entity.kind = 'project'
            JOIN projects project ON project.stable_key = project_entity.stable_key
                                 AND project.generation_id = $generation;
            """;
        command.Parameters.AddWithValue("$generation", generation);
        for (var index = 0; index < entityIds.Count; index++)
        {
            command.Parameters.AddWithValue($"$entity{index}", entityIds[index]);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var projects = new Dictionary<long, ChangeSurfaceProject>();
        while (await reader.ReadAsync(cancellationToken))
        {
            projects[reader.GetInt64(0)] = new ChangeSurfaceProject(
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetInt32(5) != 0);
        }
        return projects;
    }

    private static async Task<IReadOnlyList<WorkspaceCommandDetail>> ReadChangeSurfaceCommandsAsync(
        SqliteConnection connection,
        long generation,
        IReadOnlyList<string> projectKeys,
        CancellationToken cancellationToken)
    {
        if (projectKeys.Count == 0)
        {
            return [];
        }

        await using var command = connection.CreateCommand();
        var parameters = string.Join(", ", projectKeys.Select((_, index) => $"$project{index}"));
        command.CommandText =
            $$"""
            SELECT wc.stable_key, target.stable_key, wc.command_kind, wc.name,
                   wc.command_text, wc.working_directory, file.relative_path,
                   wc.source_line, wc.provenance, wc.condition
            FROM workspace_commands wc
            JOIN entities target ON target.id = wc.target_entity_id
            JOIN files file ON file.id = wc.source_file_id
            WHERE wc.generation_id = $generation
              AND target.stable_key IN ({{parameters}})
              AND wc.command_kind IN ('build', 'test')
            ORDER BY CASE wc.command_kind WHEN 'test' THEN 0 ELSE 1 END,
                     wc.command_text;
            """;
        command.Parameters.AddWithValue("$generation", generation);
        for (var index = 0; index < projectKeys.Count; index++)
        {
            command.Parameters.AddWithValue($"$project{index}", projectKeys[index]);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var commands = new List<WorkspaceCommandDetail>();
        while (await reader.ReadAsync(cancellationToken))
        {
            commands.Add(new WorkspaceCommandDetail(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                new OrientationEvidence(
                    reader.GetString(6),
                    reader.GetInt32(7),
                    reader.GetString(8),
                    reader.IsDBNull(9) ? null : reader.GetString(9))));
        }
        return commands;
    }

    private sealed record ChangeSurfaceNeighbor(
        RelationEntity Entity,
        string PathDirection,
        AtlasRelationMatch Relation);

    private sealed record DiscoveredSurfaceItem(
        RelationEntity Entity,
        int Depth,
        string PathDirection,
        AtlasRelationMatch ViaRelation);
}
