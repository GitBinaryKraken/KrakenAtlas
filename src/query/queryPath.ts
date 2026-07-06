export function looksLikeFileQuery(query: string): boolean {
  if (!query || /\s/u.test(query)) {
    return false;
  }
  if (query.includes("/")) {
    return true;
  }
  return /(?:^|\/)[^/]+\.(?:cs|cshtml|razor|js|mjs|cjs|jsx|ts|tsx|html?|css|scss|json|xml|csproj|sln|md|yml|yaml)$/iu.test(query);
}

export function hasPathSegment(file: string, segment: string): boolean {
  return file.split("/").includes(segment);
}

export function isLikelyTestFile(file: string): boolean {
  return /(^|\/)(test|tests|specs?)(\/|$)|(\.|-)(test|spec)\./i.test(file.replace(/\\/g, "/"));
}
