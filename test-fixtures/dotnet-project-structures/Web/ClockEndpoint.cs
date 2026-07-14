using Atlas.Structures.Contracts;

namespace Atlas.Structures.Web;

public sealed class SystemClock : IClock
{
    public ClockSnapshot GetCurrent() => new(DateTimeOffset.UtcNow);
}

public sealed class ClockEndpoint(IClock clock)
{
    public ClockSnapshot Handle() => clock.GetCurrent();
}
