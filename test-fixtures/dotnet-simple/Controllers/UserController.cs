using DotnetSimple.Services;
using Microsoft.AspNetCore.Mvc;

namespace DotnetSimple.Controllers;

[ApiController]
[Route("api/users")]
public class UserController : ControllerBase
{
    private readonly IUserService _userService;

    public UserController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpGet("{id}")]
    public UserProfile GetUser(Guid id)
    {
        return _userService.GetUser(id);
    }
}
