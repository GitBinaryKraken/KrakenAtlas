using Dapper;
using FeatureFlow.Contracts;
using Npgsql;

namespace FeatureFlow.DataAccess;

public interface IPersonaData
{
    Task<PersonaDto?> GetPublicPersonaAsync(string sid, CancellationToken cancellationToken);
}

public sealed class PersonaData(string connectionString) : IPersonaData
{
    public async Task<PersonaDto?> GetPublicPersonaAsync(
        string sid,
        CancellationToken cancellationToken)
    {
        const string sql = "SELECT sid, display_name FROM public.personas WHERE sid = @sid";
        await using var connection = new NpgsqlConnection(connectionString);
        return await connection.QuerySingleOrDefaultAsync<PersonaDto>(sql, new { sid });
    }
}
