namespace Atlas.Structures.Contracts;

public interface IClock
{
    ClockSnapshot GetCurrent();
}

public sealed record ClockSnapshot(DateTimeOffset Timestamp);
