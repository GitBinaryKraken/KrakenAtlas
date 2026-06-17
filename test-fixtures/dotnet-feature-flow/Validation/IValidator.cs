namespace DotnetFeatureFlow.Validation;

public interface IValidator<in T>
{
    void Validate(T instance);
}
