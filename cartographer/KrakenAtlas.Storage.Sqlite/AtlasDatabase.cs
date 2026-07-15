using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

internal static class AtlasDatabase
{
    private const int CurrentSchemaVersion = 2;

    private static readonly IReadOnlyList<string> Migrations =
    [
        """
        CREATE TABLE workspaces (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            current_generation_id INTEGER,
            created_utc TEXT NOT NULL,
            updated_utc TEXT NOT NULL
        );

        CREATE TABLE atlas_generations (
            id INTEGER PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            source_fingerprint TEXT NOT NULL,
            status TEXT NOT NULL,
            started_utc TEXT NOT NULL,
            completed_utc TEXT,
            UNIQUE(workspace_id, id)
        );

        CREATE TABLE workspace_roots (
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ordinal INTEGER NOT NULL,
            root_path TEXT NOT NULL,
            PRIMARY KEY(workspace_id, ordinal),
            UNIQUE(workspace_id, root_path)
        );

        CREATE TABLE solutions (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            format TEXT NOT NULL
        );

        CREATE TABLE projects (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            language TEXT NOT NULL,
            project_kind TEXT NOT NULL,
            target_frameworks TEXT,
            sdk TEXT
        );

        CREATE TABLE files (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            project_id INTEGER REFERENCES projects(id),
            root_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            language TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            is_generated INTEGER NOT NULL CHECK(is_generated IN (0, 1))
        );

        CREATE TABLE project_dependencies (
            id INTEGER PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            source_project_id INTEGER NOT NULL REFERENCES projects(id),
            target_project_id INTEGER REFERENCES projects(id),
            target_path TEXT NOT NULL,
            dependency_kind TEXT NOT NULL
        );

        CREATE TABLE entities (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            qualified_name TEXT NOT NULL,
            language TEXT NOT NULL,
            containing_entity_id INTEGER REFERENCES entities(id),
            signature TEXT,
            visibility TEXT,
            flags INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE entity_locations (
            id INTEGER PRIMARY KEY,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            file_id INTEGER NOT NULL REFERENCES files(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            location_kind TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            start_column INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            end_column INTEGER NOT NULL,
            UNIQUE(entity_id, file_id, location_kind, start_line, start_column)
        );

        CREATE TABLE relations (
            id INTEGER PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            source_entity_id INTEGER NOT NULL REFERENCES entities(id),
            target_entity_id INTEGER NOT NULL REFERENCES entities(id),
            relation_domain TEXT NOT NULL,
            relation_kind TEXT NOT NULL,
            dispatch_kind TEXT,
            logical_scope TEXT,
            UNIQUE(source_entity_id, target_entity_id, relation_domain, relation_kind)
        );

        CREATE TABLE relation_evidence (
            id INTEGER PRIMARY KEY,
            relation_id INTEGER NOT NULL REFERENCES relations(id),
            file_id INTEGER NOT NULL REFERENCES files(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            analyzer TEXT NOT NULL,
            provenance TEXT NOT NULL,
            resolution TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            start_column INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            end_column INTEGER NOT NULL,
            UNIQUE(relation_id, file_id, analyzer, start_line, start_column)
        );

        CREATE TABLE analyzer_runs (
            id INTEGER PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            analyzer TEXT NOT NULL,
            analyzer_version TEXT NOT NULL,
            capability TEXT NOT NULL,
            status TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            diagnostic TEXT
        );

        CREATE INDEX ix_solutions_generation ON solutions(workspace_id, generation_id);
        CREATE INDEX ix_projects_generation ON projects(workspace_id, generation_id);
        CREATE INDEX ix_files_generation ON files(workspace_id, generation_id);
        CREATE INDEX ix_files_project ON files(project_id, generation_id);
        CREATE INDEX ix_project_dependencies_generation ON project_dependencies(workspace_id, generation_id);
        CREATE INDEX ix_entities_generation_kind ON entities(workspace_id, generation_id, kind);
        CREATE INDEX ix_entity_locations_generation ON entity_locations(entity_id, generation_id);
        CREATE INDEX ix_relations_source ON relations(source_entity_id, generation_id, relation_kind);
        CREATE INDEX ix_relations_target ON relations(target_entity_id, generation_id, relation_kind);
        CREATE INDEX ix_relation_evidence_generation ON relation_evidence(relation_id, generation_id);
        CREATE INDEX ix_analyzer_runs_generation ON analyzer_runs(workspace_id, generation_id);
        """,
        """
        CREATE TABLE project_facets (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            project_id INTEGER NOT NULL REFERENCES projects(id),
            facet TEXT NOT NULL,
            source_file_id INTEGER NOT NULL REFERENCES files(id),
            source_line INTEGER NOT NULL,
            provenance TEXT NOT NULL,
            condition TEXT
        );

        CREATE TABLE build_dimensions (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            project_id INTEGER REFERENCES projects(id),
            dimension_kind TEXT NOT NULL,
            value TEXT NOT NULL,
            source_file_id INTEGER NOT NULL REFERENCES files(id),
            source_line INTEGER NOT NULL,
            provenance TEXT NOT NULL,
            condition TEXT
        );

        CREATE TABLE workspace_commands (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            target_entity_id INTEGER NOT NULL REFERENCES entities(id),
            command_kind TEXT NOT NULL,
            name TEXT NOT NULL,
            command_text TEXT NOT NULL,
            working_directory TEXT NOT NULL,
            source_file_id INTEGER NOT NULL REFERENCES files(id),
            source_line INTEGER NOT NULL,
            provenance TEXT NOT NULL,
            condition TEXT
        );

        CREATE TABLE repository_rules (
            id INTEGER PRIMARY KEY,
            stable_key TEXT NOT NULL UNIQUE,
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            generation_id INTEGER NOT NULL REFERENCES atlas_generations(id),
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            value TEXT,
            summary TEXT NOT NULL,
            scope TEXT NOT NULL,
            authority TEXT NOT NULL,
            precedence INTEGER NOT NULL,
            source_file_id INTEGER NOT NULL REFERENCES files(id),
            source_line INTEGER NOT NULL,
            provenance TEXT NOT NULL
        );

        CREATE INDEX ix_project_facets_generation ON project_facets(workspace_id, generation_id, project_id);
        CREATE INDEX ix_build_dimensions_generation ON build_dimensions(workspace_id, generation_id, project_id);
        CREATE INDEX ix_workspace_commands_generation ON workspace_commands(workspace_id, generation_id, command_kind);
        CREATE INDEX ix_repository_rules_generation ON repository_rules(workspace_id, generation_id, precedence);
        """
    ];

    public static async Task<SqliteConnection> OpenAsync(
        string databasePath,
        CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(databasePath));
        if (directory is null)
        {
            throw new InvalidOperationException($"Atlas path has no parent directory: {databasePath}");
        }

        Directory.CreateDirectory(directory);
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = Path.GetFullPath(databasePath),
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString());
        await connection.OpenAsync(cancellationToken);

        await ExecuteAsync(connection, "PRAGMA foreign_keys=ON;", cancellationToken);
        await ExecuteAsync(connection, "PRAGMA busy_timeout=5000;", cancellationToken);
        await ExecuteAsync(connection, "PRAGMA journal_mode=WAL;", cancellationToken);
        await MigrateAsync(connection, cancellationToken);
        return connection;
    }

    private static async Task MigrateAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        await ExecuteAsync(
            connection,
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_utc TEXT NOT NULL);",
            cancellationToken);

        await using var versionCommand = connection.CreateCommand();
        versionCommand.CommandText = "SELECT COALESCE(MAX(version), 0) FROM schema_migrations;";
        var current = Convert.ToInt32(await versionCommand.ExecuteScalarAsync(cancellationToken));
        if (current > CurrentSchemaVersion)
        {
            throw new InvalidOperationException(
                $"Atlas schema {current} is newer than supported schema {CurrentSchemaVersion}.");
        }

        for (var version = current + 1; version <= CurrentSchemaVersion; version++)
        {
            await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
            await using var migration = connection.CreateCommand();
            migration.Transaction = transaction;
            migration.CommandText = Migrations[version - 1];
            await migration.ExecuteNonQueryAsync(cancellationToken);

            await using var record = connection.CreateCommand();
            record.Transaction = transaction;
            record.CommandText = "INSERT INTO schema_migrations(version, applied_utc) VALUES ($version, $appliedUtc);";
            record.Parameters.AddWithValue("$version", version);
            record.Parameters.AddWithValue("$appliedUtc", DateTimeOffset.UtcNow.ToString("O"));
            await record.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
    }

    private static async Task ExecuteAsync(
        SqliteConnection connection,
        string sql,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
