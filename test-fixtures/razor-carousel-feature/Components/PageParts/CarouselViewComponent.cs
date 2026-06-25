using KelpApiDomain;

namespace Kelp2025_WebUI.Components.PageParts;

public sealed class CarouselViewComponent
{
    public object Invoke(string configJson)
    {
        var config = PageMediaBlockConfig.FromJson(configJson, "");
        return config;
    }
}
