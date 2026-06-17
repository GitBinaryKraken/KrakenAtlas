using DotnetFeatureFlow.Services;

namespace DotnetFeatureFlow.Background;

public sealed class PreferenceDigestWorker
{
    private readonly IUserPreferencesService _preferences;

    public PreferenceDigestWorker(IUserPreferencesService preferences)
    {
        _preferences = preferences;
    }

    public Task RunAsync(Guid userId)
    {
        return _preferences.GetPreferences(userId);
    }
}
