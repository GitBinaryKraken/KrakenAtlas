using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    public async Task<GitChangeMap> MapGitChangesAsync(
        string workspaceKey,
        IReadOnlyList<GitFileDelta> deltas,
        int maxEntities,
        CancellationToken cancellationToken = default)
    {
        if (maxEntities is < 10 or > 1000)
        {
            throw new ArgumentOutOfRangeException(nameof(maxEntities),
                "Git projection maxEntities must be between 10 and 1000.");
        }

        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        var generation = await ReadCurrentGenerationAsync(connection, workspaceKey, cancellationToken);
        if (generation is null)
        {
            return GitChangeMap.NotCreated();
        }

        var files = await ReadGitProjectionFilesAsync(connection, generation.Value, cancellationToken);
        var projects = await ReadGitProjectionProjectsAsync(connection, generation.Value, cancellationToken);
        var fileByPath = files.ToDictionary(file => NormalizeGitPath(file.FullPath), PathComparer);
        var projected = new List<GitChangedFileProjection>();
        var mappedFileIds = new HashSet<long>();
        var remainingEntities = maxEntities;
        var truncated = false;

        foreach (var delta in deltas)
        {
            var currentPath = NormalizeGitPath(Path.Combine(delta.RepositoryRoot, FromGitPath(delta.Path)));
            GitProjectionFile? file = fileByPath.GetValueOrDefault(currentPath);
            if (file is null && !string.IsNullOrWhiteSpace(delta.OldPath))
            {
                var oldPath = NormalizeGitPath(Path.Combine(delta.RepositoryRoot, FromGitPath(delta.OldPath)));
                file = fileByPath.GetValueOrDefault(oldPath);
            }

            var project = file?.Project;
            if (project is null)
            {
                project = InferProject(currentPath, projects);
            }
            var entities = file is null || remainingEntities == 0
                ? []
                : await ReadGitFileEntitiesAsync(
                    connection,
                    generation.Value,
                    file.Id,
                    Math.Min(25, remainingEntities),
                    cancellationToken);
            var entityCount = file is null
                ? 0
                : await CountGitFileEntitiesAsync(connection, generation.Value, file.Id, cancellationToken);
            var entitiesTruncated = entityCount > entities.Count;
            truncated |= entitiesTruncated || file is not null && remainingEntities == 0;
            remainingEntities -= entities.Count;
            if (file is not null)
            {
                mappedFileIds.Add(file.Id);
            }
            projected.Add(new GitChangedFileProjection(
                delta.Status,
                delta.Path,
                delta.OldPath,
                file?.StableKey,
                project,
                entitiesTruncated,
                entities));
        }

        var risks = await ReadGitAssessmentRisksAsync(
            connection,
            generation.Value,
            mappedFileIds,
            cancellationToken);
        return new GitChangeMap("current", generation, truncated, projected, risks);
    }

    private static async Task<IReadOnlyList<GitProjectionFile>> ReadGitProjectionFilesAsync(
        SqliteConnection connection,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT f.id, f.stable_key, f.root_path, f.relative_path,
                   p.stable_key, p.name, p.relative_path, p.project_kind,
                   CASE WHEN p.project_kind = 'test'
                          OR EXISTS (
                              SELECT 1 FROM project_facets facet
                              WHERE facet.project_id = p.id
                                AND facet.generation_id = $generation
                                AND facet.facet = 'test')
                        THEN 1 ELSE 0 END
            FROM files f
            LEFT JOIN projects p ON p.id = f.project_id AND p.generation_id = $generation
            WHERE f.generation_id = $generation;
            """;
        command.Parameters.AddWithValue("$generation", generation);
        var files = new List<GitProjectionFile>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var project = reader.IsDBNull(4)
                ? null
                : new ChangeSurfaceProject(
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetString(6),
                    reader.GetString(7),
                    reader.GetInt32(8) != 0);
            files.Add(new GitProjectionFile(
                reader.GetInt64(0),
                reader.GetString(1),
                FullPath(reader.GetString(2), reader.GetString(3)),
                project));
        }
        return files;
    }

    private static async Task<IReadOnlyList<GitProjectionProject>> ReadGitProjectionProjectsAsync(
        SqliteConnection connection,
        long generation,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT p.root_path, p.relative_path, p.stable_key, p.name, p.project_kind,
                   CASE WHEN p.project_kind = 'test'
                          OR EXISTS (
                              SELECT 1 FROM project_facets facet
                              WHERE facet.project_id = p.id
                                AND facet.generation_id = $generation
                                AND facet.facet = 'test')
                        THEN 1 ELSE 0 END
            FROM projects p
            WHERE p.generation_id = $generation;
            """;
        command.Parameters.AddWithValue("$generation", generation);
        var projects = new List<GitProjectionProject>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var projectPath = FullPath(reader.GetString(0), reader.GetString(1));
            projects.Add(new GitProjectionProject(
                NormalizeGitPath(Path.GetDirectoryName(projectPath)!),
                new ChangeSurfaceProject(
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetString(1),
                    reader.GetString(4),
                    reader.GetInt32(5) != 0)));
        }
        return projects;
    }

    private static async Task<IReadOnlyList<RelationEntity>> ReadGitFileEntitiesAsync(
        SqliteConnection connection,
        long generation,
        long fileId,
        int limit,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT DISTINCT e.id, e.stable_key, e.kind, e.name, e.qualified_name, e.signature
            FROM entity_locations location
            JOIN entities e ON e.id = location.entity_id AND e.generation_id = $generation
            WHERE location.file_id = $fileId AND location.generation_id = $generation
            ORDER BY CASE e.kind
                WHEN 'http_endpoint' THEN 0 WHEN 'class' THEN 1 WHEN 'interface' THEN 2
                WHEN 'record' THEN 3 WHEN 'method' THEN 4 WHEN 'test_case' THEN 5
                WHEN 'file' THEN 20 ELSE 10 END,
                e.qualified_name
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$fileId", fileId);
        command.Parameters.AddWithValue("$limit", limit);
        var entities = new List<RelationEntity>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            entities.Add(new RelationEntity(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5)));
        }
        return entities;
    }

    private static async Task<int> CountGitFileEntitiesAsync(
        SqliteConnection connection,
        long generation,
        long fileId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT COUNT(DISTINCT entity_id) FROM entity_locations "
            + "WHERE file_id = $fileId AND generation_id = $generation;";
        command.Parameters.AddWithValue("$fileId", fileId);
        command.Parameters.AddWithValue("$generation", generation);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<IReadOnlyList<GitAssessmentRisk>> ReadGitAssessmentRisksAsync(
        SqliteConnection connection,
        long generation,
        IReadOnlySet<long> fileIds,
        CancellationToken cancellationToken)
    {
        if (fileIds.Count == 0)
        {
            return [];
        }

        var fileParameters = string.Join(", ", fileIds.Select((_, index) => $"$file{index}"));
        await using var command = connection.CreateCommand();
        command.CommandText =
            $$"""
            WITH touched_dependencies(kind, stable_key) AS (
                SELECT 'file', f.stable_key
                FROM files f
                WHERE f.id IN ({{fileParameters}})
                UNION
                SELECT 'entity', e.stable_key
                FROM entity_locations location
                JOIN entities e ON e.id = location.entity_id
                WHERE location.file_id IN ({{fileParameters}})
                  AND location.generation_id = $generation
                UNION
                SELECT 'relation', CAST(evidence.relation_id AS TEXT)
                FROM relation_evidence evidence
                WHERE evidence.file_id IN ({{fileParameters}})
                  AND evidence.generation_id = $generation
            )
            SELECT DISTINCT claim.id, claim.subject_stable_key, claim.subject_kind,
                   claim.subject_qualified_name, claim.status, claim.statement,
                   dependency.dependency_kind, dependency.stable_key
            FROM touched_dependencies touched
            JOIN assessment_dependencies dependency
              ON dependency.dependency_kind = touched.kind
             AND dependency.stable_key = touched.stable_key
            JOIN assessment_claims claim ON claim.id = dependency.claim_id
            WHERE claim.status IN ('accepted', 'proposed')
            ORDER BY claim.status, claim.id, dependency.dependency_kind, dependency.stable_key;
            """;
        command.Parameters.AddWithValue("$generation", generation);
        var index = 0;
        foreach (var fileId in fileIds)
        {
            command.Parameters.AddWithValue($"$file{index++}", fileId);
        }
        var risks = new List<GitAssessmentRiskRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            risks.Add(new GitAssessmentRiskRow(
                reader.GetString(0),
                new AssessmentSubject(reader.GetString(1), reader.GetString(2), reader.GetString(3), null),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6),
                reader.GetString(7)));
        }
        return risks
            .GroupBy(risk => risk.ClaimId, StringComparer.Ordinal)
            .Select(group =>
            {
                var first = group.First();
                return new GitAssessmentRisk(
                    first.ClaimId,
                    first.Subject,
                    first.Status,
                    first.Statement,
                    group.Select(risk => new GitAssessmentRiskDependency(
                            risk.DependencyKind,
                            risk.DependencyStableKey))
                        .Distinct()
                        .OrderBy(dependency => dependency.Kind, StringComparer.Ordinal)
                        .ThenBy(dependency => dependency.StableKey, StringComparer.Ordinal)
                        .ToArray());
            })
            .ToArray();
    }

    private static ChangeSurfaceProject? InferProject(
        string fullPath,
        IReadOnlyList<GitProjectionProject> projects) => projects
        .Where(project => IsWithinPath(fullPath, project.Directory))
        .OrderByDescending(project => project.Directory.Length)
        .Select(project => project.Project)
        .FirstOrDefault();

    private static bool IsWithinPath(string path, string directory)
    {
        var relative = Path.GetRelativePath(directory, path);
        return relative != ".."
            && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            && !Path.IsPathRooted(relative);
    }

    private static string FromGitPath(string path) => path.Replace('/', Path.DirectorySeparatorChar);

    private static string NormalizeGitPath(string path) => Path.GetFullPath(path)
        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    private sealed record GitProjectionFile(
        long Id,
        string StableKey,
        string FullPath,
        ChangeSurfaceProject? Project);

    private sealed record GitProjectionProject(
        string Directory,
        ChangeSurfaceProject Project);

    private sealed record GitAssessmentRiskRow(
        string ClaimId,
        AssessmentSubject Subject,
        string Status,
        string Statement,
        string DependencyKind,
        string DependencyStableKey);
}
