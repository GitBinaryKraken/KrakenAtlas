using FeatureFlow.Contracts;
using FeatureFlow.DataAccess;

namespace FeatureFlow.Logic;

public interface IPersonaService
{
    Task<PersonaDto?> GetPublicPersonaAsync(string sid, CancellationToken cancellationToken);
}

public sealed class PersonaService(IPersonaData data) : IPersonaService
{
    public Task<PersonaDto?> GetPublicPersonaAsync(string sid, CancellationToken cancellationToken) =>
        data.GetPublicPersonaAsync(sid, cancellationToken);
}
