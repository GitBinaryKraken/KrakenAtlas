using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task<long> UpsertWorkspaceAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        WorkspaceSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO workspaces(stable_key, display_name, created_utc, updated_utc)
            VALUES ($stableKey, $displayName, $now, $now)
            ON CONFLICT(stable_key) DO UPDATE SET
                display_name = excluded.display_name,
                updated_utc = excluded.updated_utc
            RETURNING id;
            """);
        command.Parameters.AddWithValue("$stableKey", snapshot.StableKey);
        command.Parameters.AddWithValue("$displayName", snapshot.DisplayName);
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<long> InsertGenerationAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        WorkspaceSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO atlas_generations(workspace_id, source_fingerprint, status, started_utc)
            VALUES ($workspaceId, $fingerprint, 'building', $startedUtc)
            RETURNING id;
            """);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$fingerprint", snapshot.SourceFingerprint);
        command.Parameters.AddWithValue("$startedUtc", DateTimeOffset.UtcNow.ToString("O"));
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task ReplaceRootsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        IReadOnlyList<string> roots,
        CancellationToken cancellationToken)
    {
        await using (var delete = CreateCommand(
            connection, transaction, "DELETE FROM workspace_roots WHERE workspace_id = $workspaceId;"))
        {
            delete.Parameters.AddWithValue("$workspaceId", workspaceId);
            await delete.ExecuteNonQueryAsync(cancellationToken);
        }

        for (var index = 0; index < roots.Count; index++)
        {
            await using var insert = CreateCommand(connection, transaction,
                "INSERT INTO workspace_roots(workspace_id, ordinal, root_path) VALUES ($workspaceId, $ordinal, $rootPath);");
            insert.Parameters.AddWithValue("$workspaceId", workspaceId);
            insert.Parameters.AddWithValue("$ordinal", index);
            insert.Parameters.AddWithValue("$rootPath", roots[index]);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task<long> UpsertSolutionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        DiscoveredSolution solution,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO solutions(stable_key, workspace_id, generation_id, name, root_path, relative_path, format)
            VALUES ($stableKey, $workspaceId, $generation, $name, $rootPath, $relativePath, $format)
            ON CONFLICT(stable_key) DO UPDATE SET
                generation_id = excluded.generation_id,
                name = excluded.name,
                root_path = excluded.root_path,
                relative_path = excluded.relative_path,
                format = excluded.format
            RETURNING id;
            """);
        command.Parameters.AddWithValue("$stableKey", solution.StableKey);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$name", solution.Name);
        command.Parameters.AddWithValue("$rootPath", solution.RootPath);
        command.Parameters.AddWithValue("$relativePath", solution.RelativePath);
        command.Parameters.AddWithValue("$format", solution.Format);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<long> UpsertProjectAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        DiscoveredProject project,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO projects(
                stable_key, workspace_id, generation_id, name, root_path, relative_path,
                language, project_kind, target_frameworks, sdk)
            VALUES (
                $stableKey, $workspaceId, $generation, $name, $rootPath, $relativePath,
                $language, $projectKind, $targetFrameworks, $sdk)
            ON CONFLICT(stable_key) DO UPDATE SET
                generation_id = excluded.generation_id,
                name = excluded.name,
                root_path = excluded.root_path,
                relative_path = excluded.relative_path,
                language = excluded.language,
                project_kind = excluded.project_kind,
                target_frameworks = excluded.target_frameworks,
                sdk = excluded.sdk
            RETURNING id;
            """);
        command.Parameters.AddWithValue("$stableKey", project.StableKey);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$name", project.Name);
        command.Parameters.AddWithValue("$rootPath", project.RootPath);
        command.Parameters.AddWithValue("$relativePath", project.RelativePath);
        command.Parameters.AddWithValue("$language", project.Language);
        command.Parameters.AddWithValue("$projectKind", project.ProjectKind);
        command.Parameters.AddWithValue("$targetFrameworks", DbValue(project.TargetFrameworks));
        command.Parameters.AddWithValue("$sdk", DbValue(project.Sdk));
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<long> UpsertFileAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long? projectId,
        DiscoveredFile file,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO files(
                stable_key, workspace_id, generation_id, project_id, root_path, relative_path,
                language, content_hash, size_bytes, is_generated)
            VALUES (
                $stableKey, $workspaceId, $generation, $projectId, $rootPath, $relativePath,
                $language, $contentHash, $sizeBytes, $isGenerated)
            ON CONFLICT(stable_key) DO UPDATE SET
                generation_id = excluded.generation_id,
                project_id = excluded.project_id,
                root_path = excluded.root_path,
                relative_path = excluded.relative_path,
                language = excluded.language,
                content_hash = excluded.content_hash,
                size_bytes = excluded.size_bytes,
                is_generated = excluded.is_generated
            RETURNING id;
            """);
        command.Parameters.AddWithValue("$stableKey", file.StableKey);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$projectId", DbValue(projectId));
        command.Parameters.AddWithValue("$rootPath", file.RootPath);
        command.Parameters.AddWithValue("$relativePath", file.RelativePath);
        command.Parameters.AddWithValue("$language", file.Language);
        command.Parameters.AddWithValue("$contentHash", file.ContentHash);
        command.Parameters.AddWithValue("$sizeBytes", file.SizeBytes);
        command.Parameters.AddWithValue("$isGenerated", file.IsGenerated ? 1 : 0);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<long> UpsertEntityAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        string stableKey,
        string kind,
        string name,
        string qualifiedName,
        string language,
        long? containingEntityId,
        string? signature,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO entities(
                stable_key, workspace_id, generation_id, kind, name, qualified_name,
                language, containing_entity_id, signature)
            VALUES (
                $stableKey, $workspaceId, $generation, $kind, $name, $qualifiedName,
                $language, $containingEntityId, $signature)
            ON CONFLICT(stable_key) DO UPDATE SET
                generation_id = excluded.generation_id,
                kind = excluded.kind,
                name = excluded.name,
                qualified_name = excluded.qualified_name,
                language = excluded.language,
                containing_entity_id = excluded.containing_entity_id,
                signature = excluded.signature
            RETURNING id;
            """);
        command.Parameters.AddWithValue("$stableKey", stableKey);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$kind", kind);
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$qualifiedName", qualifiedName);
        command.Parameters.AddWithValue("$language", language);
        command.Parameters.AddWithValue("$containingEntityId", DbValue(containingEntityId));
        command.Parameters.AddWithValue("$signature", DbValue(signature));
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task UpsertLocationAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long generation,
        long entityId,
        long fileId,
        string locationKind,
        int line,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO entity_locations(
                entity_id, file_id, generation_id, location_kind,
                start_line, start_column, end_line, end_column)
            VALUES ($entityId, $fileId, $generation, $locationKind, $line, 1, $line, 1)
            ON CONFLICT(entity_id, file_id, location_kind, start_line, start_column) DO UPDATE SET
                generation_id = excluded.generation_id,
                end_line = excluded.end_line,
                end_column = excluded.end_column;
            """);
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$fileId", fileId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$locationKind", locationKind);
        command.Parameters.AddWithValue("$line", line);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertRelationWithEvidenceAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long sourceEntityId,
        long targetEntityId,
        string relationKind,
        long evidenceFileId,
        int evidenceLine,
        CancellationToken cancellationToken)
    {
        await using var relation = CreateCommand(connection, transaction,
            """
            INSERT INTO relations(
                workspace_id, generation_id, source_entity_id, target_entity_id,
                relation_domain, relation_kind)
            VALUES ($workspaceId, $generation, $sourceEntityId, $targetEntityId, 'code', $relationKind)
            ON CONFLICT(source_entity_id, target_entity_id, relation_domain, relation_kind) DO UPDATE SET
                generation_id = excluded.generation_id
            RETURNING id;
            """);
        relation.Parameters.AddWithValue("$workspaceId", workspaceId);
        relation.Parameters.AddWithValue("$generation", generation);
        relation.Parameters.AddWithValue("$sourceEntityId", sourceEntityId);
        relation.Parameters.AddWithValue("$targetEntityId", targetEntityId);
        relation.Parameters.AddWithValue("$relationKind", relationKind);
        var relationId = Convert.ToInt64(await relation.ExecuteScalarAsync(cancellationToken));

        await using var evidence = CreateCommand(connection, transaction,
            """
            INSERT INTO relation_evidence(
                relation_id, file_id, generation_id, analyzer, provenance, resolution,
                start_line, start_column, end_line, end_column)
            VALUES (
                $relationId, $fileId, $generation, $analyzer, 'syntax', 'exact',
                $line, 1, $line, 1)
            ON CONFLICT(relation_id, file_id, analyzer, start_line, start_column) DO UPDATE SET
                generation_id = excluded.generation_id,
                resolution = excluded.resolution;
            """);
        evidence.Parameters.AddWithValue("$relationId", relationId);
        evidence.Parameters.AddWithValue("$fileId", evidenceFileId);
        evidence.Parameters.AddWithValue("$generation", generation);
        evidence.Parameters.AddWithValue("$analyzer", DiscoveryAnalyzer);
        evidence.Parameters.AddWithValue("$line", evidenceLine);
        await evidence.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertProjectDependencyAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long sourceProjectId,
        long? targetProjectId,
        DiscoveredProjectReference reference,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO project_dependencies(
                workspace_id, generation_id, source_project_id, target_project_id,
                target_path, dependency_kind)
            VALUES ($workspaceId, $generation, $sourceProjectId, $targetProjectId, $targetPath, 'project_reference');
            """);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$sourceProjectId", sourceProjectId);
        command.Parameters.AddWithValue("$targetProjectId", DbValue(targetProjectId));
        command.Parameters.AddWithValue("$targetPath", reference.TargetPath);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertAnalyzerRunAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long durationMs,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO analyzer_runs(
                workspace_id, generation_id, analyzer, analyzer_version,
                capability, status, duration_ms)
            VALUES ($workspaceId, $generation, $analyzer, $version, 'workspace.discovery', 'succeeded', $durationMs);
            """);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$analyzer", DiscoveryAnalyzer);
        command.Parameters.AddWithValue("$version", DiscoveryVersion);
        command.Parameters.AddWithValue("$durationMs", durationMs);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task CompleteGenerationAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        CancellationToken cancellationToken)
    {
        await using (var complete = CreateCommand(connection, transaction,
            "UPDATE atlas_generations SET status = 'completed', completed_utc = $completedUtc WHERE id = $generation;"))
        {
            complete.Parameters.AddWithValue("$completedUtc", DateTimeOffset.UtcNow.ToString("O"));
            complete.Parameters.AddWithValue("$generation", generation);
            await complete.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var activate = CreateCommand(connection, transaction,
            "UPDATE workspaces SET current_generation_id = $generation, updated_utc = $updatedUtc WHERE id = $workspaceId;");
        activate.Parameters.AddWithValue("$generation", generation);
        activate.Parameters.AddWithValue("$updatedUtc", DateTimeOffset.UtcNow.ToString("O"));
        activate.Parameters.AddWithValue("$workspaceId", workspaceId);
        await activate.ExecuteNonQueryAsync(cancellationToken);
    }

}
