namespace SemanticFixture.Alpha;

public interface IProcessor
{
    string Transform(string input);
}

public abstract class ProcessorBase
{
    public virtual string Describe() => "base";
}

public sealed class Processor : ProcessorBase, IProcessor
{
    public const string DefaultName = "alpha";
    private int invocationCount;

    public event EventHandler? Completed;

    public string Name { get; init; } = DefaultName;

    public Processor()
    {
    }

    public string Transform(string input)
    {
        invocationCount++;
        Completed?.Invoke(this, EventArgs.Empty);
        return input.Trim();
    }

    public int Transform(int input) => input * 2;

    public override string Describe() => Name;
}
