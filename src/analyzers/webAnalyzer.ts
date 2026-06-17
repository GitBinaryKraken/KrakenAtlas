import * as fs from "fs/promises";
import * as path from "path";
import { FileRecord, ReferenceRecord, RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";
import { rangeFromIndex } from "./textLocation";

export interface WebAnalyzerResult {
  symbols: SymbolRecord[];
  references: ReferenceRecord[];
  relationships: RelationshipRecord[];
}

interface HtmlElementSummary {
  id: string;
  selectorKeys: string[];
  file: string;
  range: SourceRange;
}

interface ScriptSummary {
  id: string;
  file: string;
  sourcePath: string;
}

const htmlExtensions = new Set([".html", ".htm", ".cshtml", ".razor"]);
const javascriptExtensions = new Set([".js", ".mjs", ".cjs"]);

export async function analyzeVanillaWeb(workspaceRoot: string, files: FileRecord[]): Promise<WebAnalyzerResult> {
  const result: WebAnalyzerResult = {
    symbols: [],
    references: [],
    relationships: []
  };
  const elements: HtmlElementSummary[] = [];
  const scripts: ScriptSummary[] = [];

  for (const file of files.filter((candidate) => htmlExtensions.has(candidate.extension))) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    analyzeHtmlFile(text, file, result, elements, scripts);
  }

  for (const file of files.filter((candidate) => javascriptExtensions.has(candidate.extension))) {
    const text = await readWorkspaceFile(workspaceRoot, file.path);
    analyzeJavaScriptFile(text, file, result, elements);
  }

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
  scripts: ScriptSummary[]
): void {
  const viewId = `symbol:${file.language}:${file.path}`;
  result.symbols.push(symbol(viewId, path.basename(file.path), file.path, file.language, viewKind(file), file.path, rangeFromIndex(text, 0, Math.min(text.length, 1)), 0.8, ["web-view"]));

  for (const match of matchAllWithIndex(text, /<form\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    const formName = attrs.id ?? attrs.name ?? attrs["asp-action"] ?? attrs.action ?? `form:${match.index}`;
    const formId = `symbol:${file.language}:${file.path}:form:${slug(formName)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.symbols.push(symbol(formId, formName, formName, file.language, "form", file.path, range, 0.9, ["html-form"]));
    elements.push({ id: formId, selectorKeys: selectorKeys(attrs), file: file.path, range });

    const target = attrs.action ?? buildAspTarget(attrs, file.path);
    if (target) {
      result.relationships.push(relationship(formId, routeTargetId(target), "POSTS_TO", file.path, range, match[0], 0.75));
    }
  }

  for (const match of matchAllWithIndex(text, /<(input|button|a)\b([^>]*)>/gi)) {
    const tagName = match[1].toLowerCase();
    const attrs = parseAttributes(match[2]);
    const elementName = attrs.id ?? attrs.name ?? attrs["data-action"] ?? attrs.href ?? `${tagName}:${match.index}`;
    const kind = tagName === "input" ? "input" : "domElement";
    const elementId = `symbol:${file.language}:${file.path}:${tagName}:${slug(elementName)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.symbols.push(symbol(elementId, elementName, elementName, file.language, kind, file.path, range, 0.85, [`html-${tagName}`]));
    elements.push({ id: elementId, selectorKeys: selectorKeys(attrs), file: file.path, range });
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

  for (const match of matchAllWithIndex(text, /<link\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs.href || attrs.rel?.toLowerCase() !== "stylesheet") {
      continue;
    }

    const styleId = `file:${normalizeScriptSource(attrs.href)}`;
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.relationships.push(relationship(viewId, styleId, "LOADS_STYLE", file.path, range, match[0], 0.8));
  }
}

function analyzeJavaScriptFile(text: string, file: FileRecord, result: WebAnalyzerResult, elements: HtmlElementSummary[]): void {
  const scriptId = `symbol:javascript:${file.path}`;
  result.symbols.push(symbol(scriptId, path.basename(file.path), file.path, "javascript", "script", file.path, rangeFromIndex(text, 0, Math.min(text.length, 1)), 0.85, ["vanilla-js-script"]));

  for (const match of matchAllWithIndex(text, /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const functionName = match[1];
    const functionId = jsFunctionId(file.path, functionName);
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.symbols.push(symbol(functionId, functionName, `${file.path}.${functionName}`, "javascript", "function", file.path, range, 0.9, ["vanilla-js-function"]));
    result.relationships.push(relationship(scriptId, functionId, "CONTAINS", file.path, range, match[0], 0.85));
  }

  for (const match of matchAllWithIndex(text, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    const functionName = match[1];
    const functionId = jsFunctionId(file.path, functionName);
    const range = rangeFromIndex(text, match.index, match[0].length);
    result.symbols.push(symbol(functionId, functionName, `${file.path}.${functionName}`, "javascript", "function", file.path, range, 0.85, ["vanilla-js-function"]));
    result.relationships.push(relationship(scriptId, functionId, "CONTAINS", file.path, range, match[0], 0.8));
  }

  for (const match of matchAllWithIndex(text, /(?:document\.)?(querySelector|getElementById)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const selector = match[2];
    const range = rangeFromIndex(text, match.index, match[0].length);
    const domHookId = `symbol:javascript:${file.path}:selector:${slug(selector)}`;
    result.symbols.push(symbol(domHookId, selector, selector, "javascript", "domElement", file.path, range, 0.8, ["dom-selector"]));
    result.relationships.push(relationship(scriptId, domHookId, "CONTAINS", file.path, range, match[0], 0.8));
    for (const element of findMatchingElements(selector, elements)) {
      result.relationships.push(relationship(domHookId, element.id, "SELECTS_ELEMENT", file.path, range, match[0], 0.75));
    }
  }

  for (const match of matchAllWithIndex(text, /(?:document\.)?(querySelector|getElementById)\s*\(\s*["']([^"']+)["']\s*\)\s*\.addEventListener\s*\(\s*["']([^"']+)["']/g)) {
    const selector = match[2];
    const eventName = match[3];
    const range = rangeFromIndex(text, match.index, match[0].length);
    const handlerId = `symbol:javascript:${file.path}:event:${slug(selector)}:${slug(eventName)}`;
    result.symbols.push(symbol(handlerId, `${selector}:${eventName}`, `${file.path}.${selector}.${eventName}`, "javascript", "eventHandler", file.path, range, 0.85, ["dom-event-handler"]));
    result.relationships.push(relationship(scriptId, handlerId, "CONTAINS", file.path, range, match[0], 0.8));
    for (const element of findMatchingElements(selector, elements)) {
      result.relationships.push(relationship(handlerId, element.id, "HANDLES_EVENT", file.path, range, match[0], 0.75));
    }
  }

  for (const match of matchAllWithIndex(text, /\bfetch\s*\(\s*["']([^"']+)["']/g)) {
    const route = match[1];
    result.relationships.push(relationship(scriptId, routeTargetId(route), "CALLS", file.path, rangeFromIndex(text, match.index, match[0].length), match[0], 0.65));
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
  for (const match of matchAllWithIndex(attributeText, /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
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

  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("data-")) {
      keys.push(`[${key}]`, `[${key}="${value}"]`, value);
    }
  }

  return keys;
}

function findMatchingElements(selector: string, elements: HtmlElementSummary[]): HtmlElementSummary[] {
  const cleanSelector = selector.startsWith("#") ? selector.slice(1) : selector;
  return elements.filter((element) => element.selectorKeys.includes(selector) || element.selectorKeys.includes(cleanSelector));
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

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
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
