using KrakenAtlas.Core;
using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static async Task UpsertProjectFacetAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long projectId,
        long entityId,
        long sourceFileId,
        DiscoveredProjectFacet facet,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO project_facets(
                stable_key, entity_id, workspace_id, generation_id, project_id, facet,
                source_file_id, source_line, provenance, condition)
            VALUES (
                $stableKey, $entityId, $workspaceId, $generation, $projectId, $facet,
                $sourceFileId, $sourceLine, $provenance, $condition)
            ON CONFLICT(stable_key) DO UPDATE SET
                entity_id = excluded.entity_id,
                generation_id = excluded.generation_id,
                project_id = excluded.project_id,
                facet = excluded.facet,
                source_file_id = excluded.source_file_id,
                source_line = excluded.source_line,
                provenance = excluded.provenance,
                condition = excluded.condition;
            """);
        command.Parameters.AddWithValue("$stableKey", facet.StableKey);
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$projectId", projectId);
        command.Parameters.AddWithValue("$facet", facet.Facet);
        command.Parameters.AddWithValue("$sourceFileId", sourceFileId);
        command.Parameters.AddWithValue("$sourceLine", facet.Line);
        command.Parameters.AddWithValue("$provenance", facet.Provenance);
        command.Parameters.AddWithValue("$condition", DbValue(facet.Condition));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertBuildDimensionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long? projectId,
        long entityId,
        long sourceFileId,
        DiscoveredBuildDimension dimension,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO build_dimensions(
                stable_key, entity_id, workspace_id, generation_id, project_id, dimension_kind,
                value, source_file_id, source_line, provenance, condition)
            VALUES (
                $stableKey, $entityId, $workspaceId, $generation, $projectId, $kind,
                $value, $sourceFileId, $sourceLine, $provenance, $condition)
            ON CONFLICT(stable_key) DO UPDATE SET
                entity_id = excluded.entity_id,
                generation_id = excluded.generation_id,
                project_id = excluded.project_id,
                dimension_kind = excluded.dimension_kind,
                value = excluded.value,
                source_file_id = excluded.source_file_id,
                source_line = excluded.source_line,
                provenance = excluded.provenance,
                condition = excluded.condition;
            """);
        command.Parameters.AddWithValue("$stableKey", dimension.StableKey);
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$projectId", DbValue(projectId));
        command.Parameters.AddWithValue("$kind", dimension.Kind);
        command.Parameters.AddWithValue("$value", dimension.Value);
        command.Parameters.AddWithValue("$sourceFileId", sourceFileId);
        command.Parameters.AddWithValue("$sourceLine", dimension.Line);
        command.Parameters.AddWithValue("$provenance", dimension.Provenance);
        command.Parameters.AddWithValue("$condition", DbValue(dimension.Condition));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertWorkspaceCommandAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long targetEntityId,
        long entityId,
        long sourceFileId,
        DiscoveredWorkspaceCommand workspaceCommand,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO workspace_commands(
                stable_key, entity_id, workspace_id, generation_id, target_entity_id,
                command_kind, name, command_text, working_directory,
                source_file_id, source_line, provenance, condition)
            VALUES (
                $stableKey, $entityId, $workspaceId, $generation, $targetEntityId,
                $kind, $name, $commandText, $workingDirectory,
                $sourceFileId, $sourceLine, $provenance, $condition)
            ON CONFLICT(stable_key) DO UPDATE SET
                entity_id = excluded.entity_id,
                generation_id = excluded.generation_id,
                target_entity_id = excluded.target_entity_id,
                command_kind = excluded.command_kind,
                name = excluded.name,
                command_text = excluded.command_text,
                working_directory = excluded.working_directory,
                source_file_id = excluded.source_file_id,
                source_line = excluded.source_line,
                provenance = excluded.provenance,
                condition = excluded.condition;
            """);
        command.Parameters.AddWithValue("$stableKey", workspaceCommand.StableKey);
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$targetEntityId", targetEntityId);
        command.Parameters.AddWithValue("$kind", workspaceCommand.Kind);
        command.Parameters.AddWithValue("$name", workspaceCommand.Name);
        command.Parameters.AddWithValue("$commandText", workspaceCommand.CommandText);
        command.Parameters.AddWithValue("$workingDirectory", workspaceCommand.WorkingDirectory);
        command.Parameters.AddWithValue("$sourceFileId", sourceFileId);
        command.Parameters.AddWithValue("$sourceLine", workspaceCommand.Line);
        command.Parameters.AddWithValue("$provenance", workspaceCommand.Provenance);
        command.Parameters.AddWithValue("$condition", DbValue(workspaceCommand.Condition));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertRepositoryRuleAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long workspaceId,
        long generation,
        long entityId,
        long sourceFileId,
        DiscoveredRepositoryRule rule,
        CancellationToken cancellationToken)
    {
        await using var command = CreateCommand(connection, transaction,
            """
            INSERT INTO repository_rules(
                stable_key, entity_id, workspace_id, generation_id, category, name, value,
                summary, scope, authority, precedence, source_file_id, source_line, provenance)
            VALUES (
                $stableKey, $entityId, $workspaceId, $generation, $category, $name, $value,
                $summary, $scope, $authority, $precedence, $sourceFileId, $sourceLine, $provenance)
            ON CONFLICT(stable_key) DO UPDATE SET
                entity_id = excluded.entity_id,
                generation_id = excluded.generation_id,
                category = excluded.category,
                name = excluded.name,
                value = excluded.value,
                summary = excluded.summary,
                scope = excluded.scope,
                authority = excluded.authority,
                precedence = excluded.precedence,
                source_file_id = excluded.source_file_id,
                source_line = excluded.source_line,
                provenance = excluded.provenance;
            """);
        command.Parameters.AddWithValue("$stableKey", rule.StableKey);
        command.Parameters.AddWithValue("$entityId", entityId);
        command.Parameters.AddWithValue("$workspaceId", workspaceId);
        command.Parameters.AddWithValue("$generation", generation);
        command.Parameters.AddWithValue("$category", rule.Category);
        command.Parameters.AddWithValue("$name", rule.Name);
        command.Parameters.AddWithValue("$value", DbValue(rule.Value));
        command.Parameters.AddWithValue("$summary", rule.Summary);
        command.Parameters.AddWithValue("$scope", rule.Scope);
        command.Parameters.AddWithValue("$authority", rule.Authority);
        command.Parameters.AddWithValue("$precedence", rule.Precedence);
        command.Parameters.AddWithValue("$sourceFileId", sourceFileId);
        command.Parameters.AddWithValue("$sourceLine", rule.Line);
        command.Parameters.AddWithValue("$provenance", rule.Provenance);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
