namespace KelpApiDomain;

public sealed class PageMediaBlockConfig
{
    public string? Title { get; set; }
    public string? MediaSid { get; set; }
    public string? Url { get; set; }
    public string? Caption { get; set; }
    public IReadOnlyList<PageMediaItem> Items { get; set; } = [];

    public static PageMediaBlockConfig FromJson(string? json, string? fallbackContent) => new();
}

public sealed class PageMediaItem
{
    public string? Url { get; set; }
    public string? AltText { get; set; }
    public string? Caption { get; set; }
}
