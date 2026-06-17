using DotnetFeatureFlow.Options;
using DotnetFeatureFlow.Repositories;
using DotnetFeatureFlow.Validation;
using Microsoft.Extensions.Options;

namespace DotnetFeatureFlow.Services;

public sealed class UserPreferencesService : IUserPreferencesService
{
    private readonly IUserPreferencesRepository _repository;
    private readonly UserPreferenceOptions _options;
    private readonly IValidator<UserPreferenceRequest> _validator;

    public UserPreferencesService(
        IUserPreferencesRepository repository,
        IOptions<UserPreferenceOptions> options,
        IValidator<UserPreferenceRequest> validator)
    {
        _repository = repository;
        _options = options.Value;
        _validator = validator;
    }

    public async Task<UserPreferenceViewModel> GetPreferences(Guid userId)
    {
        var preference = await _repository.GetPreference(userId);
        return new UserPreferenceViewModel(
            preference.UserId,
            preference.DisplayName,
            preference.EmailOptIn,
            _options.DefaultTheme);
    }

    public async Task SavePreferences(UserPreferenceRequest request)
    {
        _validator.Validate(request);
        await _repository.SavePreference(request.UserId, request.DisplayName, request.EmailOptIn);
    }
}

public sealed record UserPreferenceRequest(Guid UserId, string DisplayName, bool EmailOptIn);

public sealed record UserPreferenceViewModel(Guid UserId, string DisplayName, bool EmailOptIn, string Theme);
