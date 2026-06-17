namespace DotnetSimple.Services;

public interface IUserService
{
    UserProfile GetUser(Guid id);
}
