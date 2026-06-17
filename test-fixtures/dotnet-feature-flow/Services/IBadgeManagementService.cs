namespace DotnetFeatureFlow.Services;

public interface IBadgeManagementService
{
    Task<BadgeForm> GetLocationBadgeAsync(long id);

    Task SaveLocationBadgeAsync(BadgeForm form);
}

public sealed record BadgeForm(long Id, string Title);
