using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<WorkspaceOrientation> GetWorkspaceOrientationAsync(
        string workspaceKey,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        await using var workspaceCommand = connection.CreateCommand();
        workspaceCommand.CommandText =
            "SELECT id, display_name, current_generation_id FROM workspaces WHERE stable_key = $stableKey;";
        workspaceCommand.Parameters.AddWithValue("$stableKey", workspaceKey);
        await using var workspaceReader = await workspaceCommand.ExecuteReaderAsync(cancellationToken);
        if (!await workspaceReader.ReadAsync(cancellationToken) || workspaceReader.IsDBNull(2))
        {
            return WorkspaceOrientation.NotCreated();
        }

        var workspaceId = workspaceReader.GetInt64(0);
        var workspaceName = workspaceReader.GetString(1);
        var generation = workspaceReader.GetInt64(2);
        await workspaceReader.CloseAsync();

        var roots = await ReadRootsAsync(connection, workspaceId, cancellationToken);
        if (!await HasOrientationRunAsync(connection, workspaceId, generation, cancellationToken))
        {
            return WorkspaceOrientation.RequiresRebuild(generation, workspaceKey, workspaceName, roots);
        }
        var facets = await ReadProjectFacetsAsync(connection, workspaceId, generation, cancellationToken);
        var dimensions = await ReadBuildDimensionsAsync(connection, workspaceId, generation, cancellationToken);
        var projects = await ReadProjectOrientationsAsync(
            connection,
            workspaceId,
            generation,
            facets,
            dimensions,
            cancellationToken);
        var commands = await ReadWorkspaceCommandsAsync(connection, workspaceId, generation, cancellationToken);
        var rules = await ReadRepositoryRulesAsync(connection, workspaceId, generation, cancellationToken);

        return new WorkspaceOrientation(
            "current",
            generation,
            workspaceKey,
            workspaceName,
            roots,
            WorkspaceOrientation.CurrentCoverage(),
            projects,
            dimensions.GetValueOrDefault(0, []),
            commands,
            rules);
    }

    private static async Task<bool> HasOrientationRunAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT EXISTS(
                SELECT 1
                FROM analyzer_runs
                WHERE workspace_id = $workspaceId
                  AND generation_id = $generation
                  AND capability = 'workspace.orientation'
                  AND status = 'succeeded');
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken)) == 1;
    }

    private static async Task<IReadOnlyList<ProjectOrientation>> ReadProjectOrientationsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        IReadOnlyDictionary<long, IReadOnlyList<ProjectFacetDetail>> facets,
        IReadOnlyDictionary<long, IReadOnlyList<BuildDimensionDetail>> dimensions,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT id, stable_key, name, relative_path, language, project_kind, sdk
            FROM projects
            WHERE workspace_id = $workspaceId AND generation_id = $generation
            ORDER BY relative_path;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var projects = new List<ProjectOrientation>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var projectId = reader.GetInt64(0);
            projects.Add(new ProjectOrientation(
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                facets.GetValueOrDefault(projectId, []),
                dimensions.GetValueOrDefault(projectId, [])));
        }
        return projects;
    }

    private static async Task<IReadOnlyDictionary<long, IReadOnlyList<ProjectFacetDetail>>> ReadProjectFacetsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT pf.project_id, pf.stable_key, pf.facet, f.relative_path,
                   pf.source_line, pf.provenance, pf.condition
            FROM project_facets pf
            JOIN files f ON f.id = pf.source_file_id
            WHERE pf.workspace_id = $workspaceId AND pf.generation_id = $generation
            ORDER BY pf.project_id, pf.facet;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var values = new Dictionary<long, List<ProjectFacetDetail>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var projectId = reader.GetInt64(0);
            values.GetOrAdd(projectId).Add(new ProjectFacetDetail(
                reader.GetString(1),
                reader.GetString(2),
                ReadEvidence(reader, 3)));
        }
        return values.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<ProjectFacetDetail>)pair.Value);
    }

    private static async Task<IReadOnlyDictionary<long, IReadOnlyList<BuildDimensionDetail>>> ReadBuildDimensionsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT bd.project_id, bd.stable_key, bd.dimension_kind, bd.value, f.relative_path,
                   bd.source_line, bd.provenance, bd.condition
            FROM build_dimensions bd
            JOIN files f ON f.id = bd.source_file_id
            WHERE bd.workspace_id = $workspaceId AND bd.generation_id = $generation
            ORDER BY bd.project_id, bd.dimension_kind, bd.value;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var values = new Dictionary<long, List<BuildDimensionDetail>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var projectId = reader.IsDBNull(0) ? 0 : reader.GetInt64(0);
            values.GetOrAdd(projectId).Add(new BuildDimensionDetail(
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                ReadEvidence(reader, 4)));
        }
        return values.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<BuildDimensionDetail>)pair.Value);
    }

    private static async Task<IReadOnlyList<WorkspaceCommandDetail>> ReadWorkspaceCommandsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT wc.stable_key, target.stable_key, wc.command_kind, wc.name,
                   wc.command_text, wc.working_directory, f.relative_path,
                   wc.source_line, wc.provenance, wc.condition
            FROM workspace_commands wc
            JOIN entities target ON target.id = wc.target_entity_id
            JOIN files f ON f.id = wc.source_file_id
            WHERE wc.workspace_id = $workspaceId AND wc.generation_id = $generation
            ORDER BY wc.command_kind, wc.command_text;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
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
                ReadEvidence(reader, 6)));
        }
        return commands;
    }

    private static async Task<IReadOnlyList<RepositoryRuleDetail>> ReadRepositoryRulesAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT rr.stable_key, rr.category, rr.name, rr.value, rr.summary, rr.scope,
                   rr.authority, rr.precedence, f.relative_path, rr.source_line, rr.provenance
            FROM repository_rules rr
            JOIN files f ON f.id = rr.source_file_id
            WHERE rr.workspace_id = $workspaceId AND rr.generation_id = $generation
            ORDER BY rr.precedence DESC, f.relative_path, rr.source_line;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rules = new List<RepositoryRuleDetail>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rules.Add(new RepositoryRuleDetail(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6),
                reader.GetInt32(7),
                new OrientationEvidence(
                    reader.GetString(8),
                    reader.GetInt32(9),
                    reader.GetString(10),
                    null)));
        }
        return rules;
    }

    private static OrientationEvidence ReadEvidence(SqliteDataReader reader, int offset) => new(
        reader.GetString(offset),
        reader.GetInt32(offset + 1),
        reader.GetString(offset + 2),
        reader.IsDBNull(offset + 3) ? null : reader.GetString(offset + 3));
}

internal static class OrientationDictionaryExtensions
{
    public static List<TValue> GetOrAdd<TKey, TValue>(
        this IDictionary<TKey, List<TValue>> dictionary,
        TKey key) where TKey : notnull
    {
        if (!dictionary.TryGetValue(key, out var values))
        {
            values = [];
            dictionary[key] = values;
        }
        return values;
    }
}
