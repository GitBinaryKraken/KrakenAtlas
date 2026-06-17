using DotnetFeatureFlow.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DotnetFeatureFlow.Controllers;

[Route("user-preferences")]
public sealed class UserPreferencesController : Controller
{
    private readonly IUserPreferencesService _preferences;

    public UserPreferencesController(IUserPreferencesService preferences)
    {
        _preferences = preferences;
    }

    [HttpGet("edit/{userId}")]
    public async Task<IActionResult> Edit(Guid userId)
    {
        var model = await _preferences.GetPreferences(userId);
        return View(model);
    }

    [HttpPost("save")]
    [Authorize("CanEditPreferences")]
    public async Task<IActionResult> Save(UserPreferenceRequest request)
    {
        await _preferences.SavePreferences(request);
        return Ok();
    }
}
