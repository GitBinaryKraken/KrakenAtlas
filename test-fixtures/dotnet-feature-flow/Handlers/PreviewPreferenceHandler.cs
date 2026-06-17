using DotnetFeatureFlow.Services;

namespace DotnetFeatureFlow.Handlers;

public sealed class PreviewPreferenceHandler : IRequestHandler<PreviewPreferenceRequest, UserPreferenceViewModel>
{
    private readonly IUserPreferencesService _preferences;

    public PreviewPreferenceHandler(IUserPreferencesService preferences)
    {
        _preferences = preferences;
    }

    public Task<UserPreferenceViewModel> Handle(PreviewPreferenceRequest request)
    {
        return _preferences.GetPreferences(request.UserId);
    }
}
