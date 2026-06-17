namespace DotnetFeatureFlow.Services;

public sealed class BadgeManagementService : IBadgeManagementService
{
    public Task<BadgeForm> GetLocationBadgeAsync(long id)
    {
        return Task.FromResult(new BadgeForm(id, "Launch"));
    }

    public Task SaveLocationBadgeAsync(BadgeForm form)
    {
        return Task.CompletedTask;
    }
}
