using Microsoft.Data.Sqlite;

namespace KrakenAtlas.Storage.Sqlite;

public sealed partial class AtlasRepository
{
    private static SqliteCommand CreateCommand(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string sql)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        return command;
    }

    private static string FullPath(string rootPath, string relativePath) =>
        Path.GetFullPath(Path.Combine(rootPath, relativePath));

    private static object DbValue(object? value) => value ?? DBNull.Value;

    private static StringComparer PathComparer => OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;
}
