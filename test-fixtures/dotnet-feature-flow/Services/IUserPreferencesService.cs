namespace DotnetFeatureFlow.Services;

public interface IUserPreferencesService
{
    Task<UserPreferenceViewModel> GetPreferences(Guid userId);

    Task SavePreferences(UserPreferenceRequest request);
}
