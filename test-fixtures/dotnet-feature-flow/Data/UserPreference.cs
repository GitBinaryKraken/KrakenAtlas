namespace DotnetFeatureFlow.Data;

public sealed class UserPreference
{
    public Guid UserId { get; set; }

    public string DisplayName { get; set; } = "";

    public bool EmailOptIn { get; set; }
}
