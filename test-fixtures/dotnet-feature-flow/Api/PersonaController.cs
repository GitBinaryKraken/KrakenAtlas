using FeatureFlow.Logic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FeatureFlow.Api;

[ApiController]
[Route("[controller]")]
public sealed class PersonaController(IPersonaService personas) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Get(string url, CancellationToken cancellationToken)
    {
        var persona = await personas.GetPublicPersonaAsync(url, cancellationToken);
        return persona is null ? NotFound() : Ok(persona);
    }
}
