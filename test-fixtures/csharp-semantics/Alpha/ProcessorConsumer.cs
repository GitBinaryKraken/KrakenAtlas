namespace SemanticFixture.Alpha;

public sealed class ProcessorConsumer
{
    private Processor? current;

    public string Run(string input)
    {
        current = new Processor { Name = "custom" };
        IProcessor contract = current;
        var transformed = contract.Transform(input);
        var doubled = current.Transform(2);
        return $"{current.Describe()}:{current.Name}:{transformed}:{doubled}";
    }

    public void Reset()
    {
        current = null;
    }
}
