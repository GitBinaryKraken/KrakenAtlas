namespace DotnetSimple.Services;

public class UserService : IUserService
{
    public UserProfile GetUser(Guid id)
    {
        return new UserProfile(id, $"User {id}");
    }
}

public record UserProfile(Guid Id, string Name);
