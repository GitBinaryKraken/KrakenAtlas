using DotnetFeatureFlow.Data;

namespace DotnetFeatureFlow.Repositories;

public sealed class UserPreferencesRepository : IUserPreferencesRepository
{
    private readonly ApplicationDbContext _db;

    public UserPreferencesRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public Task<UserPreference> GetPreference(Guid userId)
    {
        return _db.UserPreferences.FindAsync(userId).AsTask();
    }

    public async Task SavePreference(Guid userId, string displayName, bool emailOptIn)
    {
        var preference = await GetPreference(userId);
        preference.DisplayName = displayName;
        preference.EmailOptIn = emailOptIn;
        _db.UserPreferences.Update(preference);
        await _db.SaveChangesAsync();
    }
}
