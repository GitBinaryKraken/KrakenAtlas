import * as fs from "fs/promises";
import * as path from "path";
import { FileRecord, ReferenceRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";
import { analyzeJavaScriptControllerFlows as analyzeJavaScriptFlows } from "./javascriptFlowAnalyzer";
import { analyzeReactSources, isReactSourceFile, ReactSource } from "./reactAnalyzer";
import { rangeFromIndex } from "./textLocation";
import { analyzeTypeScriptProjects } from "./typescriptProjectAnalyzer";
import { HtmlElementSummary, JavaScriptSource, WebAnalyzerResult } from "./webAnalyzerTypes";
export { WebAnalyzerResult } from "./webAnalyzerTypes";

interface ScriptSummary {
  id: string;
  file: string;
  sourcePath: string;
}

const htmlExtensions = new Set([".html", ".htm", ".cshtml", ".razor"]);
const javascriptExtensions = new Set([".js", ".mjs", ".cjs"]);

export async function analyzeVanillaWeb(workspaceRoot: string, files: FileRecord[], csharpSymbols: SymbolRecord[] = []): Promise<WebAnalyzerResult> {
  const result: WebAnalyzerResult = {
    symbols: [],
    references: [],
    relationships: []
  };
  const elements: HtmlElementSummary[] = [];
  const scripts: ScriptSummary[] = [];
  const javascriptSources: JavaScriptSource[] = [];
  const reactSources: ReactSource[] = [];

  for (const file of files.filter((candidate) => htmlExtensions.has(candidate.extension))) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    analyzeHtmlFile(text, file, result, elements, scripts, csharpSymbols);
  }

  for (const file of files.filter((candidate) => javascriptExtensions.has(candidate.extension))) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    analyzeJavaScriptFile(text, file, result, elements);
    javascriptSources.push({ file, text, scriptId: `symbol:javascript:${file.path}` });
  }

  for (const file of files.filter(isReactSourceFile)) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    reactSources.push({ file, text });
  }

  const typeScriptProjects = await analyzeTypeScriptProjects(workspaceRoot, files, result);
  analyzeJavaScriptFlows(javascriptSources, result);
  analyzeReactSources(reactSources, result, typeScriptProjects);

  result.symbols.sort((left, right) => left.id.localeCompare(right.id));
  result.references.sort((left, right) => left.id.localeCompare(right.id));
  result.relationships.sort((left, right) => left.id.localeCompare(right.id));
  deduplicateById(result.symbols);
  deduplicateById(result.references);
  deduplicateById(result.relationships);
  return result;
}

function analyzeHtmlFile(
  text: string,
  file: FileRecord,
  result: WebAnalyzerResult,
  elements: HtmlElementSummary[],
  scripts: ScriptSummary[],
  csharpSymbols: SymbolRecord[]
): void {
  const viewId = `symbol:${file.language}:${file.path}`;
  result.symbols.push(symbol(viewId, path.basename(file.path), file.path, file.language, viewKind(file), file.path, rangeFromIndex(text, 0, Math.min(text.length, 1)), 0.8, ["web-view"]));

  for (const match of matchAllWithIndex(text, /<form\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    const formName = attrs.id ?? attrs.name ?? attrs["asp-action"] ?? attrs.action ?? `form:${match.index}`;
    const formId = `symbol:${file.language}:${file.path}:form:${slug(formName)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.symbols.push(symbol(formId, formName, formName, file.language, "form", file.path, range, 0.9, ["html-form"]));
    elements.push({ id: formId, selectorKeys: selectorKeys(attrs), name: formName, file: file.path, range });

    const target = attrs.action ?? buildAspTarget(attrs, file.path);
    if (target) {
      result.relationships.push(relationship(formId, routeTargetId(target), "POSTS_TO", file.path, range, match[0], 0.75));
    }
  }

  for (const match of matchAllWithIndex(text, /<(input|textarea|select|button|a)\b([^>]*)>/gi)) {
    const tagName = match[1].toLowerCase();
    const attrs = parseAttributes(match[2]);
    const modelBindingTarget = modelBindingName(attrs["asp-for"] ?? attrs.name);
    const elementName = attrs.id ?? attrs.name ?? attrs["asp-for"] ?? attrs["data-action"] ?? attrs.href ?? `${tagName}:${match.index}`;
    const kind = tagName === "input" || tagName === "textarea" || tagName === "select" ? "input" : "domElement";
    const elementId = `symbol:${file.language}:${file.path}:${tagName}:${slug(elementName)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.symbols.push(symbol(elementId, elementName, elementName, file.language, kind, file.path, range, 0.85, [`html-${tagName}`]));
    elements.push({ id: elementId, selectorKeys: selectorKeys(attrs), name: attrs.name ?? attrs["asp-for"] ?? attrs.id, modelBindingTarget, file: file.path, range });
    if (modelBindingTarget) {
      result.relationships.push(relationship(elementId, `model-binding:${modelBindingTarget}`, "BINDS_MODEL_PROPERTY", file.path, range, match[0], 0.7));
    }
  }

  for (const match of matchAllWithIndex(text, /<script\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs.src) {
      continue;
    }

    const scriptPath = normalizeScriptSource(attrs.src);
    const scriptId = `symbol:javascript:${scriptPath}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    scripts.push({ id: scriptId, file: file.path, sourcePath: scriptPath });
    result.references.push(reference(scriptPath, scriptId, file.path, range, "script-src", match[0], 0.85));
    result.relationships.push(relationship(viewId, scriptId, "LOADS_SCRIPT", file.path, range, match[0], 0.85));
  }

  for (const match of matchAllWithIndex(text, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (attrs.src) {
      continue;
    }

    const scriptText = match[2];
    const scriptStart = match.index + match[0].indexOf(scriptText);
    const scriptId = `symbol:javascript:${file.path}:inline-script:${scriptStart}`;
    const range = rangeFromIndex(text, scriptStart, Math.min(scriptText.length, 1));
    result.symbols.push(symbol(scriptId, `inline script ${path.basename(file.path)}`, `${file.path}.inlineScript.${scriptStart}`, "javascript", "script", file.path, range, 0.75, ["inline-js-script"]));
    result.relationships.push(relationship(viewId, scriptId, "CONTAINS", file.path, range, "<script>", 0.75));
    analyzeJavaScriptText(scriptText, file.path, scriptId, result, elements, scriptStart, text);
  }

  for (const match of matchAllWithIndex(text, /<link\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs.href || attrs.rel?.toLowerCase() !== "stylesheet") {
      continue;
    }

    const styleId = `file:${normalizeScriptSource(attrs.href)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.relationships.push(relationship(viewId, styleId, "LOADS_STYLE", file.path, range, match[0], 0.8));
  }

  analyzeRazorCSharpUsage(text, file, viewId, result, csharpSymbols);
  analyzeRazorComponentUsage(text, file, viewId, result);
}

function analyzeJavaScriptFile(text: string, file: FileRecord, result: WebAnalyzerResult, elements: HtmlElementSummary[]): void {
  const scriptId = `symbol:javascript:${file.path}`;
  result.symbols.push(symbol(scriptId, path.basename(file.path), file.path, "javascript", "script", file.path, rangeFromIndex(text, 0, Math.min(text.length, 1)), 0.85, ["vanilla-js-script"]));
  analyzeJavaScriptText(text, file.path, scriptId, result, elements);
}

function analyzeJavaScriptText(text: string, filePath: string, scriptId: string, result: WebAnalyzerResult, elements: HtmlElementSummary[], offset = 0, fullText = text): void {
  for (const match of matchAllWithIndex(text, /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const functionName = match[1];
    const functionId = jsFunctionId(filePath, functionName);
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    result.symbols.push(symbol(functionId, functionName, `${filePath}.${functionName}`, "javascript", "function", filePath, range, 0.9, ["vanilla-js-function"]));
    result.relationships.push(relationship(scriptId, functionId, "CONTAINS", filePath, range, match[0], 0.85));
  }

  for (const match of matchAllWithIndex(text, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    const functionName = match[1];
    const functionId = jsFunctionId(filePath, functionName);
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    result.symbols.push(symbol(functionId, functionName, `${filePath}.${functionName}`, "javascript", "function", filePath, range, 0.85, ["vanilla-js-function"]));
    result.relationships.push(relationship(scriptId, functionId, "CONTAINS", filePath, range, match[0], 0.8));
  }

  analyzeBrowserQueryState(text, filePath, scriptId, result, offset, fullText);

  const variableSelectors = new Map<string, { selector: string; range: SourceRange; evidence: string }>();
  const selectorCall = /(?:(?:document|[A-Za-z_$][\w$]*)\.)?(querySelector|querySelectorAll|getElementById)\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g;
  for (const match of matchAllWithIndex(text, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\?\.[A-Za-z_$][\w$]*|\([^)]*\))*\??\.)?(querySelector|querySelectorAll|getElementById)\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g)) {
    variableSelectors.set(match[1], {
      selector: match[3] ?? match[4],
      range: sourceRange(fullText, offset + match.index, match[0].length),
      evidence: match[0]
    });
  }

  for (const match of matchAllWithIndex(text, selectorCall)) {
    const selector = match[2] ?? match[3];
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const domHookId = `symbol:javascript:${filePath}:selector:${slug(selector)}`;
    result.symbols.push(symbol(domHookId, selector, selector, "javascript", "domElement", filePath, range, 0.8, ["dom-selector"]));
    result.relationships.push(relationship(scriptId, domHookId, "CONTAINS", filePath, range, match[0], 0.8));
    for (const element of findMatchingElements(selector, elements)) {
      result.relationships.push(relationship(domHookId, element.id, "SELECTS_ELEMENT", filePath, range, match[0], 0.75));
    }
  }

  for (const match of matchAllWithIndex(text, /(?:(?:document|[A-Za-z_$][\w$]*)\.)?(querySelector|querySelectorAll|getElementById)\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)\s*\.addEventListener\s*\(\s*(?:"([^"]+)"|'([^']+)')/g)) {
    const selector = match[2] ?? match[3];
    const eventName = match[4] ?? match[5];
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const handlerId = `symbol:javascript:${filePath}:event:${slug(selector)}:${slug(eventName)}`;
    result.symbols.push(symbol(handlerId, `${selector}:${eventName}`, `${filePath}.${selector}.${eventName}`, "javascript", "eventHandler", filePath, range, 0.85, ["dom-event-handler"]));
    result.relationships.push(relationship(scriptId, handlerId, "CONTAINS", filePath, range, match[0], 0.8));
    for (const element of findMatchingElements(selector, elements)) {
      result.relationships.push(relationship(handlerId, element.id, "HANDLES_EVENT", filePath, range, match[0], 0.75));
    }
  }

  for (const match of matchAllWithIndex(text, /\bfetch\s*\(\s*["']([^"']+)["']/g)) {
    const route = match[1];
    result.relationships.push(relationship(scriptId, routeTargetId(route), "CALLS", filePath, sourceRange(fullText, offset + match.index, match[0].length), match[0], 0.65));
  }

  for (const match of matchAllWithIndex(text, /(?:(?:document|[A-Za-z_$][\w$]*)\.)?(querySelector|getElementById)\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)\s*\.value\s*=/g)) {
    const selector = match[2] ?? match[3];
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const writerId = `symbol:javascript:${filePath}:writer:${slug(selector)}`;
    result.symbols.push(symbol(writerId, `${selector}:value`, `${filePath}.${selector}.valueWriter`, "javascript", "fieldWriter", filePath, range, 0.8, ["dom-field-writer"]));
    result.relationships.push(relationship(scriptId, writerId, "CONTAINS", filePath, range, match[0], 0.75));
    for (const element of findMatchingElements(selector, elements)) {
      result.relationships.push(relationship(writerId, element.id, "WRITES_FIELD", filePath, range, match[0], 0.78));
    }
  }

  for (const match of matchAllWithIndex(text, /\b([A-Za-z_$][\w$]*)\.value\s*=/g)) {
    const variable = match[1];
    const selector = variableSelectors.get(variable);
    if (!selector) {
      continue;
    }

    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const writerId = `symbol:javascript:${filePath}:writer:${slug(selector.selector)}`;
    result.symbols.push(symbol(writerId, `${selector.selector}:value`, `${filePath}.${selector.selector}.valueWriter`, "javascript", "fieldWriter", filePath, range, 0.8, ["dom-field-writer"]));
    result.relationships.push(relationship(scriptId, writerId, "CONTAINS", filePath, range, match[0], 0.75));
    for (const element of findMatchingElements(selector.selector, elements)) {
      result.relationships.push(relationship(writerId, element.id, "WRITES_FIELD", filePath, range, match[0], 0.78));
    }
  }

  for (const match of matchAllWithIndex(text, /\b(write[A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*,/g)) {
    const functionName = match[1];
    const variable = match[2];
    const selector = variableSelectors.get(variable);
    if (!selector) {
      continue;
    }

    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const writerId = `symbol:javascript:${filePath}:writer:${slug(selector.selector)}:${slug(functionName)}`;
    result.symbols.push(symbol(writerId, `${selector.selector}:${functionName}`, `${filePath}.${selector.selector}.${functionName}`, "javascript", "fieldWriter", filePath, range, 0.78, ["dom-field-writer"]));
    result.relationships.push(relationship(scriptId, writerId, "CONTAINS", filePath, range, match[0], 0.72));
    for (const element of findMatchingElements(selector.selector, elements)) {
      result.relationships.push(relationship(writerId, element.id, "WRITES_FIELD", filePath, range, match[0], 0.76));
    }
  }
}

function analyzeBrowserQueryState(text: string, filePath: string, scriptId: string, result: WebAnalyzerResult, offset: number, fullText: string): void {
  const queryStateId = "browser-state:query-string";
  for (const match of matchAllWithIndex(text, /\bnew\s+URLSearchParams\s*\(\s*(?:(?:window|global)\.)?location\.search\b[^)]*\)/g)) {
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const readerId = `symbol:javascript:${filePath}:browser-state:query-string:read:${range.startLine}`;
    result.symbols.push(symbol(readerId, "query string read", `${filePath}.queryStringRead.${range.startLine}`, "javascript", "browserStateReader", filePath, range, 0.9, ["browser-query-state"]));
    result.relationships.push(relationship(scriptId, readerId, "CONTAINS", filePath, range, match[0], 0.8));
    result.relationships.push(relationship(readerId, queryStateId, "READS_QUERY_STRING", filePath, range, match[0], 0.9));
  }

  for (const match of matchAllWithIndex(text, /(?:(?:window|global)\.)?history\.(replaceState|pushState)\s*\([^;\n]*/g)) {
    const range = sourceRange(fullText, offset + match.index, match[0].length);
    const method = match[1];
    const writerId = `symbol:javascript:${filePath}:browser-state:history:${slug(method)}:${range.startLine}`;
    result.symbols.push(symbol(writerId, `${method} browser history`, `${filePath}.${method}.${range.startLine}`, "javascript", "browserStateWriter", filePath, range, 0.88, ["browser-query-state"]));
    result.relationships.push(relationship(scriptId, writerId, "CONTAINS", filePath, range, match[0], 0.8));
    result.relationships.push(relationship(writerId, "browser-state:history", "WRITES_BROWSER_HISTORY", filePath, range, match[0], 0.86));
    if (/location\.search|URLSearchParams|\.toString\s*\(|["'`]\?/i.test(match[0])) {
      result.relationships.push(relationship(writerId, queryStateId, "WRITES_QUERY_STRING", filePath, range, match[0], 0.86));
    }
  }
}

function analyzeRazorCSharpUsage(text: string, file: FileRecord, viewId: string, result: WebAnalyzerResult, csharpSymbols: SymbolRecord[]): void {
  const injections = new Map<string, { symbolId: string; typeId: string; typeName: string; typeFqn: string }>();
  for (const match of matchAllWithIndex(text, /@inject\s+([A-Za-z_][A-Za-z0-9_.<>,?]*)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const typeName = match[1];
    const alias = match[2];
    const typeSymbol = resolveCSharpType(typeName, csharpSymbols);
    const typeFqn = typeSymbol?.fullyQualifiedName ?? typeName;
    const typeId = typeSymbol?.id ?? `symbol:csharp:${typeFqn}`;
    const injectedSymbolId = `symbol:razor:${file.path}:inject:${slug(alias)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    injections.set(alias, { symbolId: injectedSymbolId, typeId, typeName, typeFqn });
    result.symbols.push(symbol(injectedSymbolId, alias, `${file.path}.${alias}`, "razor", "injectedService", file.path, range, 0.92, ["razor-injection"]));
    result.references.push(reference(typeName, typeId, file.path, range, "razor-inject", match[0], 0.9));
    result.relationships.push(relationship(viewId, typeId, "RAZOR_INJECTS", file.path, range, match[0], 0.92));
  }

  for (const [alias, injection] of injections) {
    const callPattern = new RegExp(`\\b${escapeRegExp(alias)}\\.([A-Za-z_][A-Za-z0-9_]*)\\s*\\(`, "g");
    for (const match of matchAllWithIndex(text, callPattern)) {
      const methodName = match[1];
      const methodSymbol = resolveCSharpMethod(injection.typeFqn, methodName, csharpSymbols);
      const target = methodSymbol?.id ?? `symbol:csharp:${injection.typeFqn}.${methodName}`;
      const range = rangeFromIndex(text, match.index, match[0].length);
      result.references.push(reference(`${injection.typeName}.${methodName}`, target, file.path, range, "razor-injected-call", match[0], 0.82));
      result.relationships.push(relationship(injection.symbolId, target, "CALLS_INJECTED_SERVICE", file.path, range, match[0], 0.84));
    }
  }

  for (const match of matchAllWithIndex(text, /\b([A-Z][A-Za-z0-9_]+)\.FromJson\s*\(/g)) {
    const typeName = match[1];
    const range = rangeFromIndex(text, match.index, match[0].length);
    const target = `symbol:csharp:${typeName}.FromJson`;
    result.references.push(reference(`${typeName}.FromJson`, target, file.path, range, "razor-csharp-call", match[0], 0.65));
    result.relationships.push(relationship(viewId, target, "USES_CSHARP_SYMBOL", file.path, range, match[0], 0.65));
  }

  for (const match of matchAllWithIndex(text, /\b([A-Z][A-Za-z0-9_]+)\.([A-Z][A-Za-z0-9_]+)\b/g)) {
    const typeName = match[1];
    const memberName = match[2];
    if (memberName === "FromJson") {
      continue;
    }

    const range = rangeFromIndex(text, match.index, match[0].length);
    const target = `symbol:csharp:${typeName}.${memberName}`;
    result.references.push(reference(`${typeName}.${memberName}`, target, file.path, range, "razor-csharp-member", match[0], 0.55));
    result.relationships.push(relationship(viewId, target, "USES_CSHARP_SYMBOL", file.path, range, match[0], 0.55));
  }
}

function resolveCSharpType(typeName: string, symbols: SymbolRecord[]): SymbolRecord | undefined {
  const simpleName = typeName.split(".").pop()?.replace(/[?]$/u, "") ?? typeName;
  return symbols
    .filter((candidate) => ["class", "interface", "record", "struct"].includes(candidate.kind) && candidate.name === simpleName)
    .sort((left, right) => {
      const leftExact = left.fullyQualifiedName === typeName ? 0 : 1;
      const rightExact = right.fullyQualifiedName === typeName ? 0 : 1;
      return leftExact - rightExact || left.id.localeCompare(right.id);
    })[0];
}

function resolveCSharpMethod(typeFqn: string, methodName: string, symbols: SymbolRecord[]): SymbolRecord | undefined {
  return symbols.find((candidate) =>
    candidate.kind === "method" &&
    candidate.name === methodName &&
    (candidate.fullyQualifiedName?.startsWith(`${typeFqn}.${methodName}(`) ?? candidate.id.startsWith(`symbol:csharp:${typeFqn}.${methodName}(`))
  );
}

function analyzeRazorComponentUsage(text: string, file: FileRecord, viewId: string, result: WebAnalyzerResult): void {
  for (const match of matchAllWithIndex(text, /Component\.InvokeAsync\s*\(\s*["']([^"']+)["']/g)) {
    const componentName = match[1].replace(/ViewComponent$/i, "");
    const range = rangeFromIndex(text, match.index, match[0].length);
    const componentSymbol = `symbol:csharp:${componentName}ViewComponent`;
    const viewPath = `Views/Shared/Components/${componentName}/Default.cshtml`;
    result.relationships.push(relationship(viewId, componentSymbol, "INVOKES_VIEW_COMPONENT", file.path, range, match[0], 0.72));
    result.relationships.push(relationship(componentSymbol, `file:${viewPath}`, "RENDERS_VIEW", file.path, range, match[0], 0.65));
  }
}

async function readWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(workspaceRoot, relativePath), "utf8");
}

function symbol(id: string, name: string, fullyQualifiedName: string, language: string, kind: string, file: string, range: SourceRange, confidence: number, patterns: string[] = []): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language,
    file,
    range,
    patterns,
    confidence
  };
}

function reference(symbolName: string, resolvedSymbolId: string, file: string, range: SourceRange, context: string, snippet: string, confidence: number): ReferenceRecord {
  return {
    recordType: "reference",
    id: `reference:web:${file}:${range.startLine}:${slug(symbolName)}`,
    symbolName,
    resolvedSymbolId,
    file,
    range,
    context,
    snippet,
    confidence
  };
}

function relationship(from: string, to: string, type: string, file: string, range: SourceRange, evidence: string, confidence: number): RelationshipRecord {
  return {
    recordType: "relationship",
    id: `relationship:${type.toLowerCase()}:web:${slug(from)}->${slug(to)}`,
    from,
    to,
    type,
    file,
    range,
    evidence,
    confidence
  };
}

function viewKind(file: FileRecord): string {
  return file.extension === ".cshtml" || file.extension === ".razor" ? "view" : "domElement";
}

function parseAttributes(attributeText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const valuedAttributePattern = /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of matchAllWithIndex(attributeText, valuedAttributePattern)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  const withoutValuedAttributes = attributeText.replace(valuedAttributePattern, " ");
  for (const match of matchAllWithIndex(withoutValuedAttributes, /(?:^|\s)([:@A-Za-z_][\w:.-]*)(?=\s|$)/g)) {
    const name = match[1].toLowerCase();
    if (!(name in attrs)) {
      attrs[name] = "";
    }
  }

  return attrs;
}

function selectorKeys(attrs: Record<string, string>): string[] {
  const keys: string[] = [];
  if (attrs.id) {
    keys.push(`#${attrs.id}`, attrs.id);
  }

  if (attrs.name) {
    keys.push(`[name="${attrs.name}"]`, attrs.name);
  }

  if (attrs["asp-for"]) {
    keys.push(`[asp-for="${attrs["asp-for"]}"]`, attrs["asp-for"], `[name="${attrs["asp-for"]}"]`);
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("data-")) {
      keys.push(`[${key}]`, `[${key}="${value}"]`, value);
    }
  }

  return keys;
}

function modelBindingName(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  const normalized = name.replace(/\[\d+\]/g, "[]").replace(/\[[^\]]+\]/g, "[]");
  return normalized.includes(".") ? normalized : undefined;
}

function findMatchingElements(selector: string, elements: HtmlElementSummary[]): HtmlElementSummary[] {
  const cleanSelector = selector.startsWith("#") ? selector.slice(1) : selector;
  return elements.filter((element) => element.selectorKeys.includes(selector) || element.selectorKeys.includes(cleanSelector) || selectorMatchesByName(selector, element));
}

function selectorMatchesByName(selector: string, element: HtmlElementSummary): boolean {
  if (!element.name) {
    return false;
  }

  const nameMatch = /\[name\s*=\s*["']([^"']+)["']\]/i.exec(selector);
  return nameMatch ? nameMatch[1] === element.name : false;
}

function buildAspTarget(attrs: Record<string, string>, filePath = ""): string | undefined {
  if (attrs["asp-page-handler"]) {
    const page = attrs["asp-page"] ? attrs["asp-page"].replace(/^\/+/, "").replace(/\//g, ".") : razorPageNameFromPath(filePath);
    return `razor-page-handler:${[page, attrs["asp-page-handler"]].filter(Boolean).join(".")}`;
  }

  if (attrs["asp-page"]) {
    return attrs["asp-page"];
  }

  if (attrs["asp-controller"] || attrs["asp-action"]) {
    return [attrs["asp-controller"], attrs["asp-action"]].filter(Boolean).join(".");
  }

  return undefined;
}

function razorPageNameFromPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/(?:^|\/)Pages\/(.+)\.cshtml$/i);
  return match ? match[1].replace(/\//g, ".") : undefined;
}

function routeTargetId(route: string): string {
  if (route.startsWith("razor-page-handler:")) {
    return `route:${route}`;
  }

  return `route:web:${route}`;
}

function normalizeScriptSource(source: string): string {
  return source.replace(/^~?\//, "");
}

function jsFunctionId(filePath: string, functionName: string): string {
  return `symbol:javascript:${filePath}:${functionName}`;
}

function sourceRange(fullText: string, index: number, length: number): SourceRange {
  return rangeFromIndex(fullText, index, length);
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchAllWithIndex(text: string, pattern: RegExp): Array<RegExpExecArray & { index: number }> {
  const matches: Array<RegExpExecArray & { index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match as RegExpExecArray & { index: number });
  }

  return matches;
}

function deduplicateById<T extends { id: string }>(records: T[]): void {
  const seen = new Set<string>();
  for (let index = records.length - 1; index >= 0; index--) {
    if (seen.has(records[index].id)) {
      records.splice(index, 1);
    } else {
      seen.add(records[index].id);
    }
  }
}
