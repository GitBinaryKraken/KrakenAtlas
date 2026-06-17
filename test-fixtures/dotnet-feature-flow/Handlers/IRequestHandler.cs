namespace DotnetFeatureFlow.Handlers;

public interface IRequestHandler<in TRequest, TResponse>
{
    Task<TResponse> Handle(TRequest request);
}
