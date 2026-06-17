using Microsoft.EntityFrameworkCore;

namespace DotnetFeatureFlow.Data;

public sealed class ApplicationDbContext : DbContext
{
    public DbSet<UserPreference> UserPreferences => Set<UserPreference>();
}
