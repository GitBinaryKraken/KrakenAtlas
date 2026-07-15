using System.Diagnostics;
using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository(string databasePath)
{
    private const string DiscoveryAnalyzer = "workspace-discovery";
    private const string DiscoveryVersion = "1.1.0";

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
    }

    public async Task<BuildAtlasResult> BuildAsync(
        WorkspaceSnapshot snapshot,
        CSharpSemanticSnapshot semanticSnapshot,
        CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);

        var workspaceId = await UpsertWorkspaceAsync(connection, transaction, snapshot, cancellationToken);
        var generation = await InsertGenerationAsync(connection, transaction, workspaceId, snapshot, cancellationToken);
        await ReplaceRootsAsync(connection, transaction, workspaceId, snapshot.Roots, cancellationToken);

        var solutionIds = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var solution in snapshot.Solutions)
        {
            solutionIds[solution.StableKey] = await UpsertSolutionAsync(
                connection, transaction, workspaceId, generation, solution, cancellationToken);
        }

        var projectIds = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var project in snapshot.Projects)
        {
            projectIds[project.StableKey] = await UpsertProjectAsync(
                connection, transaction, workspaceId, generation, project, cancellationToken);
        }

        var fileIds = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var file in snapshot.Files)
        {
            projectIds.TryGetValue(file.ProjectKey ?? string.Empty, out var projectId);
            fileIds[file.StableKey] = await UpsertFileAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                projectId == 0 ? null : projectId,
                file,
                cancellationToken);
        }

        var filesByPath = snapshot.Files.ToDictionary(
            file => FullPath(file.RootPath, file.RelativePath),
            file => file,
            PathComparer);
        var entityIds = new Dictionary<string, long>(StringComparer.Ordinal);
        entityIds[snapshot.StableKey] = await UpsertEntityAsync(
            connection,
            transaction,
            workspaceId,
            generation,
            snapshot.StableKey,
            "workspace",
            snapshot.DisplayName,
            snapshot.DisplayName,
            "workspace",
            null,
            null,
            cancellationToken);

        foreach (var solution in snapshot.Solutions)
        {
            var file = filesByPath[FullPath(solution.RootPath, solution.RelativePath)];
            var fileId = fileIds[file.StableKey];
            entityIds[solution.StableKey] = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                solution.StableKey,
                "solution",
                solution.Name,
                solution.RelativePath,
                "text",
                entityIds[snapshot.StableKey],
                null,
                cancellationToken);
            await UpsertLocationAsync(
                connection, transaction, generation, entityIds[solution.StableKey], fileId, "definition", 1, cancellationToken);
        }

        foreach (var project in snapshot.Projects)
        {
            var file = filesByPath[FullPath(project.RootPath, project.RelativePath)];
            var fileId = fileIds[file.StableKey];
            entityIds[project.StableKey] = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                project.StableKey,
                "project",
                project.Name,
                project.RelativePath,
                project.Language,
                entityIds[snapshot.StableKey],
                project.TargetFrameworks,
                cancellationToken);
            await UpsertLocationAsync(
                connection, transaction, generation, entityIds[project.StableKey], fileId, "definition", 1, cancellationToken);
        }

        foreach (var file in snapshot.Files)
        {
            var fileId = fileIds[file.StableKey];
            var containingEntityId = file.ProjectKey is not null && entityIds.TryGetValue(file.ProjectKey, out var projectEntityId)
                ? projectEntityId
                : entityIds[snapshot.StableKey];
            entityIds[file.StableKey] = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                file.StableKey,
                "file",
                Path.GetFileName(file.RelativePath),
                file.RelativePath,
                file.Language,
                containingEntityId,
                null,
                cancellationToken);
            await UpsertLocationAsync(
                connection, transaction, generation, entityIds[file.StableKey], fileId, "definition", 1, cancellationToken);
        }

        foreach (var solution in snapshot.Solutions)
        {
            var file = filesByPath[FullPath(solution.RootPath, solution.RelativePath)];
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                entityIds[snapshot.StableKey],
                entityIds[solution.StableKey],
                "contains",
                fileIds[file.StableKey],
                1,
                cancellationToken);
        }

        foreach (var project in snapshot.Projects)
        {
            var file = filesByPath[FullPath(project.RootPath, project.RelativePath)];
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                entityIds[snapshot.StableKey],
                entityIds[project.StableKey],
                "contains",
                fileIds[file.StableKey],
                1,
                cancellationToken);
        }

        foreach (var file in snapshot.Files)
        {
            var sourceEntityId = file.ProjectKey is not null && entityIds.TryGetValue(file.ProjectKey, out var projectEntityId)
                ? projectEntityId
                : entityIds[snapshot.StableKey];
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                sourceEntityId,
                entityIds[file.StableKey],
                "contains",
                fileIds[file.StableKey],
                1,
                cancellationToken);
        }

        foreach (var reference in snapshot.ProjectReferences)
        {
            var sourceProjectId = projectIds[reference.SourceProjectKey];
            var targetProjectId = reference.TargetProjectKey is not null
                && projectIds.TryGetValue(reference.TargetProjectKey, out var resolvedProjectId)
                    ? resolvedProjectId
                    : (long?)null;
            await InsertProjectDependencyAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                sourceProjectId,
                targetProjectId,
                reference,
                cancellationToken);

            if (reference.TargetProjectKey is null || !entityIds.TryGetValue(reference.TargetProjectKey, out var targetEntityId))
            {
                continue;
            }

            var sourceProject = snapshot.Projects.Single(project => project.StableKey == reference.SourceProjectKey);
            var sourceFile = filesByPath[FullPath(sourceProject.RootPath, sourceProject.RelativePath)];
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                entityIds[reference.SourceProjectKey],
                targetEntityId,
                "references",
                fileIds[sourceFile.StableKey],
                reference.Line,
                cancellationToken);
        }

        await PersistOrientationAsync(
            connection,
            transaction,
            workspaceId,
            generation,
            snapshot,
            projectIds,
            fileIds,
            entityIds,
            filesByPath,
            cancellationToken);
        await PersistCSharpSymbolsAsync(
            connection,
            transaction,
            workspaceId,
            generation,
            semanticSnapshot,
            projectIds,
            fileIds,
            entityIds,
            filesByPath,
            cancellationToken);

        stopwatch.Stop();
        await InsertAnalyzerRunAsync(
            connection,
            transaction,
            workspaceId,
            generation,
            stopwatch.ElapsedMilliseconds,
            cancellationToken);
        await InsertSemanticAnalyzerRunAsync(
            connection,
            transaction,
            workspaceId,
            generation,
            semanticSnapshot.AnalyzerRun,
            cancellationToken);
        await CompleteGenerationAsync(connection, transaction, workspaceId, generation, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var summary = await GetSummaryAsync(snapshot.StableKey, cancellationToken);
        return new BuildAtlasResult(generation, snapshot.StableKey, summary.Counts, stopwatch.ElapsedMilliseconds);
    }

    public async Task<AtlasSummary> GetSummaryAsync(
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
            return AtlasSummary.NotCreated();
        }

        var workspaceId = workspaceReader.GetInt64(0);
        var workspaceName = workspaceReader.GetString(1);
        var generation = workspaceReader.GetInt64(2);
        await workspaceReader.CloseAsync();

        var roots = await ReadRootsAsync(connection, workspaceId, cancellationToken);
        var counts = await ReadCountsAsync(connection, workspaceId, generation, cancellationToken);
        var projects = await ReadProjectsAsync(connection, workspaceId, generation, cancellationToken);
        var runs = await ReadAnalyzerRunsAsync(connection, workspaceId, generation, cancellationToken);
        return new AtlasSummary(
            "current",
            generation,
            workspaceKey,
            workspaceName,
            roots,
            counts,
            projects,
            runs);
    }

    public async Task<EntityDetail?> GetEntityAsync(
        string workspaceKey,
        string? stableKey,
        long? id,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(stableKey) && id is null)
        {
            throw new ArgumentException("Exact entity lookup requires stableKey or id.");
        }
        if (!string.IsNullOrWhiteSpace(stableKey) && id is not null)
        {
            throw new ArgumentException("Exact entity lookup accepts stableKey or id, not both.");
        }

        await using var connection = await AtlasDatabase.OpenAsync(databasePath, cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT e.id, e.stable_key, e.kind, e.name, e.qualified_name, e.language,
                   e.signature, e.generation_id
            FROM entities e
            JOIN workspaces w ON w.id = e.workspace_id
            WHERE w.stable_key = $workspaceKey
              AND w.current_generation_id = e.generation_id
              AND (($stableKey IS NOT NULL AND e.stable_key = $stableKey)
                   OR ($id IS NOT NULL AND e.id = $id))
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$workspaceKey", workspaceKey);
        command.Parameters.AddWithValue("$stableKey", DbValue(stableKey));
        command.Parameters.AddWithValue("$id", DbValue(id));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var entityId = reader.GetInt64(0);
        var entityStableKey = reader.GetString(1);
        var kind = reader.GetString(2);
        var name = reader.GetString(3);
        var qualifiedName = reader.GetString(4);
        var language = reader.GetString(5);
        var signature = reader.IsDBNull(6) ? null : reader.GetString(6);
        var generation = reader.GetInt64(7);
        await reader.CloseAsync();

        var locations = await ReadLocationsAsync(connection, entityId, generation, cancellationToken);
        var incoming = await CountRelationsAsync(connection, "target_entity_id", entityId, generation, cancellationToken);
        var outgoing = await CountRelationsAsync(connection, "source_entity_id", entityId, generation, cancellationToken);
        return new EntityDetail(
            entityId,
            entityStableKey,
            kind,
            name,
            qualifiedName,
            language,
            signature,
            generation,
            incoming,
            outgoing,
            locations);
    }

}
