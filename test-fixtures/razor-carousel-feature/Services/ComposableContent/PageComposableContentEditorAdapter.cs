using KelpApiDomain;

namespace Kelp2025_WebUI.Services.ComposableContent;

public sealed class PageComposableContentEditorAdapter
{
    public SavePageDraftPartRequest BuildSaveRequest(ComposableEditorPartViewModel part)
    {
        return new SavePageDraftPartRequest
        {
            ConfigJson = part.ConfigJson
        };
    }
}
