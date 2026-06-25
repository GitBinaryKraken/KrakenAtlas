import { RelationshipRecord, SourceRange, SymbolRecord } from "../model/records";
import { rangeFromIndex } from "./textLocation";
import { JavaScriptSource, WebAnalyzerResult } from "./webAnalyzerTypes";

interface JavaScriptCallable {
  id: string;
  name: string;
  file: string;
  start: number;
  bodyStart: number;
  end: number;
  range: SourceRange;
  declaration: string;
}

export function analyzeJavaScriptControllerFlows(sources: JavaScriptSource[], result: WebAnalyzerResult): void {
  const callables = sources.flatMap((source) => discoverJavaScriptCallables(source));
  const callablesByName = new Map<string, JavaScriptCallable[]>();
  for (const callable of callables) {
    const matches = callablesByName.get(callable.name) ?? [];
    if (!matches.some((candidate) => candidate.id === callable.id)) matches.push(callable);
    callablesByName.set(callable.name, matches);
    if (!callable.id.endsWith(`:${callable.name}`)) {
      result.symbols.push(symbol(callable.id, callable.name, `${callable.file}.${callable.name}`, "method", callable.file, callable.range, 0.86, ["javascript-controller-method"]));
      result.relationships.push(relationship(`symbol:javascript:${callable.file}`, callable.id, "CONTAINS", callable.file, callable.range, callable.declaration, 0.82));
    }
  }

  for (const source of sources) {
    const fileCallables = callables.filter((callable) => callable.file === source.file.path);
    analyzeCalls(source, fileCallables, callablesByName, result);
    analyzeEvents(source, fileCallables, result);
    analyzeAliasedBrowserHistory(source, fileCallables, result);
    analyzeDomState(source, fileCallables, result);
  }
}

function discoverJavaScriptCallables(source: JavaScriptSource): JavaScriptCallable[] {
  const callables: JavaScriptCallable[] = [];
  const declarations: Array<{ pattern: RegExp; kind: "function" | "prototype" | "object" }> = [
    { pattern: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g, kind: "function" },
    { pattern: /\b([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\([^)]*\)\s*\{/g, kind: "prototype" },
    { pattern: /\b([A-Za-z_$][\w$]*)\s*:\s*function\s*\([^)]*\)\s*\{/g, kind: "object" }
  ];

  for (const declaration of declarations) {
    for (const match of matchAll(source.text, declaration.pattern)) {
      const name = declaration.kind === "function" ? match[1] : match[2] ?? match[1];
      const owner = declaration.kind === "prototype" ? match[1] : "object";
      const openBrace = match.index + match[0].lastIndexOf("{");
      const closeBrace = findMatchingBrace(source.text, openBrace);
      if (closeBrace < 0) continue;
      const startLine = sourceRange(source.text, match.index, 1).startLine;
      const id = declaration.kind === "function"
        ? jsFunctionId(source.file.path, name)
        : `symbol:javascript:${source.file.path}:method:${slug(owner)}.${slug(name)}:${startLine}`;
      if (callables.some((candidate) => candidate.id === id)) continue;
      callables.push({
        id, name, file: source.file.path, start: match.index, bodyStart: openBrace + 1, end: closeBrace + 1,
        range: sourceRange(source.text, match.index, closeBrace + 1 - match.index),
        declaration: match[0].slice(0, 160)
      });
    }
  }
  return callables.sort((left, right) => left.start - right.start || left.end - right.end);
}

function analyzeCalls(source: JavaScriptSource, fileCallables: JavaScriptCallable[], callablesByName: Map<string, JavaScriptCallable[]>, result: WebAnalyzerResult): void {
  for (const match of matchAll(source.text, /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    addResolvedCall(source, fileCallables, callablesByName, match[2], match, result);
  }
  const ignored = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof"]);
  for (const match of matchAll(source.text, /\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const previous = match.index > 0 ? source.text[match.index - 1] : "";
    if (previous === "." || ignored.has(match[1])) continue;
    if (/function\s*$/u.test(source.text.slice(Math.max(0, match.index - 12), match.index))) continue;
    addResolvedCall(source, fileCallables, callablesByName, match[1], match, result);
  }
}

function addResolvedCall(source: JavaScriptSource, fileCallables: JavaScriptCallable[], callablesByName: Map<string, JavaScriptCallable[]>, methodName: string, match: IndexedMatch, result: WebAnalyzerResult): void {
  const targets = callablesByName.get(methodName) ?? [];
  if (targets.length !== 1) return;
  const caller = containingCallable(fileCallables, match.index);
  const from = caller?.id ?? source.scriptId;
  const target = targets[0];
  if (from === target.id || (match.index >= target.start && match.index < target.bodyStart)) return;
  result.relationships.push(relationship(from, target.id, "CALLS", source.file.path, sourceRange(source.text, match.index, match[0].length), match[0], 0.82));
}

function analyzeEvents(source: JavaScriptSource, callables: JavaScriptCallable[], result: WebAnalyzerResult): void {
  for (const match of matchAll(source.text, /\.(_emit|on|addEventListener)\s*\(\s*["']([^"']+)["']/g)) {
    const from = containingCallable(callables, match.index)?.id ?? source.scriptId;
    result.relationships.push(relationship(from, `event:javascript:${slug(match[2])}`, match[1] === "_emit" ? "EMITS_EVENT" : "SUBSCRIBES_EVENT", source.file.path, sourceRange(source.text, match.index, match[0].length), match[0], 0.84));
  }
  for (const callable of callables) {
    const emit = /^emit([A-Z].*)$/u.exec(callable.name);
    const subscribe = /^on([A-Z].*)$/u.exec(callable.name);
    if (emit) result.relationships.push(relationship(callable.id, `event:javascript:${slug(lowerFirst(emit[1]))}`, "EMITS_EVENT", callable.file, callable.range, callable.declaration, 0.72));
    if (subscribe) result.relationships.push(relationship(callable.id, `event:javascript:${slug(lowerFirst(subscribe[1]))}`, "SUBSCRIBES_EVENT", callable.file, callable.range, callable.declaration, 0.72));
  }
}

function analyzeAliasedBrowserHistory(source: JavaScriptSource, callables: JavaScriptCallable[], result: WebAnalyzerResult): void {
  const aliases = new Set(matchAll(source.text, /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*(?:(?:window|global)\.)?history\b[^;\n]*/g).map((match) => match[1]));
  for (const alias of aliases) {
    for (const match of matchAll(source.text, new RegExp(`\\b${escapeRegExp(alias)}\\.(replaceState|pushState)\\s*\\([^;\\n]*`, "g"))) {
      const range = sourceRange(source.text, match.index, match[0].length);
      const writerId = `symbol:javascript:${source.file.path}:browser-state:history:${slug(match[1])}:${range.startLine}`;
      result.symbols.push(symbol(writerId, `${match[1]} browser history`, `${source.file.path}.${match[1]}.${range.startLine}`, "browserStateWriter", source.file.path, range, 0.9, ["browser-query-state", "injected-browser-api"]));
      result.relationships.push(relationship(containingCallable(callables, match.index)?.id ?? source.scriptId, writerId, "CONTAINS", source.file.path, range, match[0], 0.82));
      result.relationships.push(relationship(writerId, "browser-state:history", "WRITES_BROWSER_HISTORY", source.file.path, range, match[0], 0.9));
    }
  }
}

function analyzeDomState(source: JavaScriptSource, callables: JavaScriptCallable[], result: WebAnalyzerResult): void {
  for (const callable of callables) {
    const body = source.text.slice(callable.bodyStart, callable.end - 1);
    if (!/\.classList\.(?:toggle|add|remove)\s*\(/u.test(body)) continue;
    for (const match of matchAll(body, /querySelectorAll?\s*\(\s*["']([^"']+)["']/g)) {
      const range = sourceRange(source.text, callable.bodyStart + match.index, match[0].length);
      const selectorId = `symbol:javascript:${source.file.path}:selector:${slug(match[1])}`;
      result.symbols.push(symbol(selectorId, match[1], match[1], "domElement", source.file.path, range, 0.82, ["dom-selector"]));
      result.relationships.push(relationship(callable.id, selectorId, "UPDATES_ELEMENT_STATE", source.file.path, range, match[0], 0.8));
    }
  }
}

function containingCallable(callables: JavaScriptCallable[], index: number): JavaScriptCallable | undefined {
  return callables.filter((callable) => index >= callable.bodyStart && index < callable.end).sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
}

function findMatchingBrace(text: string, openBrace: number): number {
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = openBrace; index < text.length; index += 1) {
    const character = text[index], next = text[index + 1] ?? "";
    if (lineComment) { if (character === "\n") lineComment = false; continue; }
    if (blockComment) { if (character === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === quote) quote = ""; continue; }
    if (character === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (character === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (character === '"' || character === "'" || character === "`") { quote = character; continue; }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }
  return -1;
}

type IndexedMatch = RegExpExecArray & { index: number };
function matchAll(text: string, pattern: RegExp): IndexedMatch[] { return [...text.matchAll(pattern)] as IndexedMatch[]; }
function sourceRange(text: string, index: number, length: number): SourceRange { return rangeFromIndex(text, index, length); }
function jsFunctionId(file: string, name: string): string { return `symbol:javascript:${file}:${name}`; }
function slug(value: string): string { return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_"); }
function lowerFirst(value: string): string { return value ? value[0].toLowerCase() + value.slice(1) : value; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function symbol(id: string, name: string, fullyQualifiedName: string, kind: string, file: string, range: SourceRange, confidence: number, patterns: string[]): SymbolRecord {
  return { recordType: "symbol", id, name, fullyQualifiedName, kind, language: "javascript", file, range, patterns, confidence };
}

function relationship(from: string, to: string, type: string, file: string, range: SourceRange, evidence: string, confidence: number): RelationshipRecord {
  return { recordType: "relationship", id: `relationship:${type.toLowerCase()}:web:${slug(from)}->${slug(to)}`, from, to, type, file, range, evidence, confidence };
}
