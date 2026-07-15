using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task PersistOrientationAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        WorkspaceSnapshot snapshot,
        IReadOnlyDictionary<string, long> projectIds,
        IReadOnlyDictionary<string, long> fileIds,
        IDictionary<string, long> entityIds,
        IReadOnlyDictionary<string, DiscoveredFile> filesByPath,
        CancellationToken cancellationToken)
    {
        var projectsByKey = snapshot.Projects.ToDictionary(project => project.StableKey, StringComparer.Ordinal);

        long GetSourceFileId(string rootPath, string relativePath)
        {
            if (!filesByPath.TryGetValue(FullPath(rootPath, relativePath), out var file))
            {
                throw new InvalidDataException($"Orientation evidence file was not discovered: {relativePath}");
            }
            return fileIds[file.StableKey];
        }

        foreach (var facet in snapshot.ProjectFacets)
        {
            var project = projectsByKey[facet.ProjectKey];
            var projectEntityId = entityIds[facet.ProjectKey];
            var sourceFileId = GetSourceFileId(facet.SourceRootPath, facet.SourceRelativePath);
            var entityId = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                facet.StableKey,
                "project_facet",
                facet.Facet,
                $"{project.RelativePath}#facet:{facet.Facet}",
                "build",
                projectEntityId,
                facet.Condition,
                cancellationToken);
            entityIds[facet.StableKey] = entityId;
            await UpsertLocationAsync(
                connection, transaction, generation, entityId, sourceFileId, "definition", facet.Line, cancellationToken);
            await UpsertProjectFacetAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                projectIds[facet.ProjectKey],
                entityId,
                sourceFileId,
                facet,
                cancellationToken);
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                projectEntityId,
                entityId,
                "has_facet",
                sourceFileId,
                facet.Line,
                cancellationToken,
                relationDomain: "build",
                provenance: facet.Provenance);
        }

        foreach (var dimension in snapshot.BuildDimensions)
        {
            var projectId = dimension.ProjectKey is not null ? projectIds[dimension.ProjectKey] : (long?)null;
            var targetEntityId = dimension.ProjectKey is not null
                ? entityIds[dimension.ProjectKey]
                : entityIds[snapshot.StableKey];
            var targetName = dimension.ProjectKey is not null
                ? projectsByKey[dimension.ProjectKey].RelativePath
                : snapshot.DisplayName;
            var sourceFileId = GetSourceFileId(dimension.SourceRootPath, dimension.SourceRelativePath);
            var entityId = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                dimension.StableKey,
                BuildDimensionEntityKind(dimension.Kind),
                dimension.Value,
                $"{targetName}#{dimension.Kind}:{dimension.Value}",
                "build",
                targetEntityId,
                dimension.Condition,
                cancellationToken);
            entityIds[dimension.StableKey] = entityId;
            await UpsertLocationAsync(
                connection, transaction, generation, entityId, sourceFileId, "definition", dimension.Line, cancellationToken);
            await UpsertBuildDimensionAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                projectId,
                entityId,
                sourceFileId,
                dimension,
                cancellationToken);

            var isTarget = dimension.Kind is "target_framework" or "runtime_identifier";
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                isTarget ? targetEntityId : entityId,
                isTarget ? entityId : targetEntityId,
                isTarget ? "targets" : "applies_to",
                sourceFileId,
                dimension.Line,
                cancellationToken,
                relationDomain: "build",
                provenance: dimension.Provenance);
        }

        foreach (var workspaceCommand in snapshot.Commands)
        {
            var targetEntityId = entityIds[workspaceCommand.TargetKey];
            var sourceFileId = GetSourceFileId(workspaceCommand.SourceRootPath, workspaceCommand.SourceRelativePath);
            var entityId = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                workspaceCommand.StableKey,
                CommandEntityKind(workspaceCommand.Kind),
                workspaceCommand.Name,
                workspaceCommand.CommandText,
                "build",
                targetEntityId,
                workspaceCommand.WorkingDirectory,
                cancellationToken);
            entityIds[workspaceCommand.StableKey] = entityId;
            await UpsertLocationAsync(
                connection,
                transaction,
                generation,
                entityId,
                sourceFileId,
                "definition",
                workspaceCommand.Line,
                cancellationToken);
            await UpsertWorkspaceCommandAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                targetEntityId,
                entityId,
                sourceFileId,
                workspaceCommand,
                cancellationToken);
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                targetEntityId,
                entityId,
                CommandRelationKind(workspaceCommand.Kind),
                sourceFileId,
                workspaceCommand.Line,
                cancellationToken,
                relationDomain: "build",
                provenance: workspaceCommand.Provenance);
        }

        foreach (var rule in snapshot.RepositoryRules)
        {
            var sourceFileId = GetSourceFileId(rule.SourceRootPath, rule.SourceRelativePath);
            var entityId = await UpsertEntityAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                rule.StableKey,
                "repository_rule",
                rule.Name,
                $"{rule.SourceRelativePath}#{rule.Name}",
                rule.Category == "agent_instructions" ? "markdown" : "build",
                entityIds[snapshot.StableKey],
                rule.Summary,
                cancellationToken);
            entityIds[rule.StableKey] = entityId;
            await UpsertLocationAsync(
                connection, transaction, generation, entityId, sourceFileId, "definition", rule.Line, cancellationToken);
            await UpsertRepositoryRuleAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                entityId,
                sourceFileId,
                rule,
                cancellationToken);
            await UpsertRelationWithEvidenceAsync(
                connection,
                transaction,
                workspaceId,
                generation,
                entityId,
                entityIds[snapshot.StableKey],
                "governs",
                sourceFileId,
                rule.Line,
                cancellationToken,
                relationDomain: rule.Authority == "repository_documentation" ? "documentation" : "build",
                provenance: rule.Provenance);
        }
    }

    private static string BuildDimensionEntityKind(string kind) => kind switch
    {
        "target_framework" => "target_framework",
        "build_configuration" => "build_configuration",
        "runtime_identifier" => "runtime_identifier",
        _ => "build_dimension"
    };

    private static string CommandEntityKind(string kind) => kind switch
    {
        "build" => "build_command",
        "test" => "test_command",
        "run" => "run_command",
        "format" => "format_command",
        "generate" => "generation_command",
        "package" => "package_command",
        "migrate" => "migration_command",
        _ => "run_command"
    };

    private static string CommandRelationKind(string kind) => kind switch
    {
        "build" => "builds",
        "test" => "tests",
        "run" => "runs",
        "format" => "formats",
        "generate" => "generates",
        "package" => "packages",
        "migrate" => "runs",
        _ => "runs"
    };
}
