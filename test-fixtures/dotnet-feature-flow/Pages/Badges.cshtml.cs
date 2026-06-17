using DotnetFeatureFlow.Services;

namespace DotnetFeatureFlow.Pages;

public sealed class BadgesModel
{
    private readonly IBadgeManagementService _badgeManagementService;

    public BadgesModel(IBadgeManagementService badgeManagementService)
    {
        _badgeManagementService = badgeManagementService;
    }

    public BadgeForm BadgeInput { get; set; } = new(0, "");

    public async Task OnGetAsync()
    {
        BadgeInput = await _badgeManagementService.GetLocationBadgeAsync(1);
    }

    public async Task OnPostSaveLocationBadgeAsync()
    {
        await _badgeManagementService.SaveLocationBadgeAsync(BadgeInput);
    }
}
