using FeatureFlow.Contracts;
using FeatureFlow.DataAccess;
using FeatureFlow.Logic;
using Xunit;

namespace FeatureFlow.Tests;

public sealed class PersonaServiceTests
{
    [Fact]
    public async Task GetPublicPersona_returns_record()
    {
        var service = new PersonaService(new StubPersonaData());

        var result = await service.GetPublicPersonaAsync("persona-1", CancellationToken.None);

        Assert.NotNull(result);
    }

    private sealed class StubPersonaData : IPersonaData
    {
        public Task<PersonaDto?> GetPublicPersonaAsync(
            string sid,
            CancellationToken cancellationToken) =>
            Task.FromResult<PersonaDto?>(new PersonaDto(sid, "Test Persona"));
    }
}
