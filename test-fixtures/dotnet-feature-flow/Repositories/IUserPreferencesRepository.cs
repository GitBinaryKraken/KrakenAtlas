using DotnetFeatureFlow.Data;

namespace DotnetFeatureFlow.Repositories;

public interface IUserPreferencesRepository
{
    Task<UserPreference> GetPreference(Guid userId);

    Task SavePreference(Guid userId, string displayName, bool emailOptIn);
}
