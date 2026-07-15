namespace Xunit;

[AttributeUsage(AttributeTargets.Method)]
internal sealed class FactAttribute : Attribute;

internal static class Assert
{
    public static void NotNull(object? value)
    {
        if (value is null)
        {
            throw new InvalidOperationException("Expected a value.");
        }
    }
}
