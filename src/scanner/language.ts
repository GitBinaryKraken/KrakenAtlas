const languageByExtension = new Map<string, string>([
  [".cs", "csharp"],
  [".cshtml", "razor"],
  [".razor", "razor"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".jsx", "javascript"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".html", "html"],
  [".htm", "html"],
  [".css", "css"],
  [".scss", "scss"],
  [".json", "json"],
  [".xml", "xml"],
  [".config", "xml"],
  [".sln", "dotnet-solution"],
  [".csproj", "dotnet-project"],
  [".props", "msbuild"],
  [".targets", "msbuild"],
  [".md", "markdown"],
  [".sql", "sql"]
]);

export function guessLanguage(extension: string): string {
  return languageByExtension.get(extension.toLowerCase()) ?? "unknown";
}
