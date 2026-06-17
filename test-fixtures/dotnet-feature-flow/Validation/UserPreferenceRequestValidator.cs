using DotnetFeatureFlow.Services;

namespace DotnetFeatureFlow.Validation;

public sealed class UserPreferenceRequestValidator : IValidator<UserPreferenceRequest>
{
    public void Validate(UserPreferenceRequest instance)
    {
        if (string.IsNullOrWhiteSpace(instance.DisplayName))
        {
            throw new InvalidOperationException("Display name is required.");
        }
    }
}
