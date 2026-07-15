using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task<IReadOnlyList<string>> ReadRootsAsync(
        SqliteConnection connection,
        long workspaceId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT root_path FROM workspace_roots WHERE workspace_id = $workspaceId ORDER BY ordinal;";
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var roots = new List<string>();
        while (await reader.ReadAsync(cancellationToken))
        {
            roots.Add(reader.GetString(0));
        }
        return roots;
    }

    private static async Task<AtlasCounts> ReadCountsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT
                (SELECT COUNT(*) FROM solutions WHERE workspace_id = $workspaceId AND generation_id = $generation),
                (SELECT COUNT(*) FROM projects WHERE workspace_id = $workspaceId AND generation_id = $generation),
                (SELECT COUNT(*) FROM files WHERE workspace_id = $workspaceId AND generation_id = $generation),
                (SELECT COUNT(*) FROM entities WHERE workspace_id = $workspaceId AND generation_id = $generation),
                (SELECT COUNT(*) FROM relations WHERE workspace_id = $workspaceId AND generation_id = $generation),
                (SELECT COUNT(*) FROM project_dependencies WHERE workspace_id = $workspaceId AND generation_id = $generation);
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return new AtlasCounts(
            reader.GetInt32(0),
            reader.GetInt32(1),
            reader.GetInt32(2),
            reader.GetInt32(3),
            reader.GetInt32(4),
            reader.GetInt32(5));
    }

    private static async Task<IReadOnlyList<ProjectSummary>> ReadProjectsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT p.id, p.stable_key, p.name, p.relative_path, p.language, p.project_kind,
                   p.target_frameworks,
                   (SELECT COUNT(*) FROM project_dependencies d
                    WHERE d.source_project_id = p.id AND d.generation_id = $generation)
            FROM projects p
            WHERE p.workspace_id = $workspaceId AND p.generation_id = $generation
            ORDER BY p.relative_path;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var projects = new List<ProjectSummary>();
        while (await reader.ReadAsync(cancellationToken))
        {
            projects.Add(new ProjectSummary(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.GetInt32(7)));
        }
        return projects;
    }

    private static async Task<IReadOnlyList<AnalyzerRunSummary>> ReadAnalyzerRunsAsync(
        SqliteConnection connection,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT analyzer, capability, status, duration_ms, diagnostic
            FROM analyzer_runs
            WHERE workspace_id = $workspaceId AND generation_id = $generation
            ORDER BY analyzer;
            """;
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var runs = new List<AnalyzerRunSummary>();
        while (await reader.ReadAsync(cancellationToken))
        {
            runs.Add(new AnalyzerRunSummary(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt64(3),
                reader.IsDBNull(4) ? null : reader.GetString(4)));
        }
        return runs;
    }

    private static async Task<IReadOnlyList<EntityLocationDetail>> ReadLocationsAsync(
        SqliteConnection connection,
        long entityId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT f.stable_key, f.relative_path, l.location_kind,
                   l.start_line, l.start_column, l.end_line, l.end_column
            FROM entity_locations l
            JOIN files f ON f.id = l.file_id
            WHERE l.entity_id = $entityId AND l.generation_id = $generation
            ORDER BY f.relative_path, l.start_line, l.start_column;
            """;
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$generation", generation);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var locations = new List<EntityLocationDetail>();
        while (await reader.ReadAsync(cancellationToken))
        {
            locations.Add(new EntityLocationDetail(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.GetInt32(6)));
        }
        return locations;
    }

    private static async Task<int> CountRelationsAsync(
        SqliteConnection connection,
        string entityColumn,
        long entityId,
        long generation,
        CancellationToken cancellationToken)
    {
        if (entityColumn is not ("source_entity_id" or "target_entity_id"))
        {
            throw new ArgumentOutOfRangeException(nameof(entityColumn));
        }

        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM relations WHERE {entityColumn} = $entityId AND generation_id = $generation;";
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$generation", generation);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

}
