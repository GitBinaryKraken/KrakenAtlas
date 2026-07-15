using System.Net.Http.Json;
using FeatureFlow.Contracts;

namespace FeatureFlow.Connector;

public interface IPersonaConnector
{
    Task<PersonaDto?> GetPublicPersonaAsync(string sid, CancellationToken cancellationToken);
}

public sealed class PersonaConnector(HttpClient client) : IPersonaConnector
{
    public async Task<PersonaDto?> GetPublicPersonaAsync(
        string sid,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, $"/Persona?url={sid}");
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PersonaDto>(cancellationToken);
    }

    private static HttpRequestMessage CreateRequest(HttpMethod method, string route) => new(method, route);
}
