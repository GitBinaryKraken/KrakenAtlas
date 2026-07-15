namespace SemanticFixture.Services;

public partial class PartialService
{
    public Task<string> LoadAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(Name);
}
