using FeatureFlow.Connector;
using Microsoft.AspNetCore.Mvc;

namespace FeatureFlow.WebUI;

public sealed class PersonaController(IPersonaConnector personas) : Controller
{
    public async Task<IActionResult> Index(string id, CancellationToken cancellationToken)
    {
        var persona = await personas.GetPublicPersonaAsync(id, cancellationToken);
        return View(persona);
    }
}
