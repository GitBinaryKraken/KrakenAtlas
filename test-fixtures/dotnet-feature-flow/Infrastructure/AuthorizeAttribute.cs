namespace Microsoft.AspNetCore.Authorization;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true, Inherited = true)]
public sealed class AuthorizeAttribute : Attribute
{
    public AuthorizeAttribute()
    {
    }

    public AuthorizeAttribute(string policy)
    {
        Policy = policy;
    }

    public string? Policy { get; }
    public string? Roles { get; set; }
}
