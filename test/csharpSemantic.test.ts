import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  AtlasSummary,
  BuildAtlasResult,
  CodeUsageResult,
  EntityDetail,
  SymbolSearchResult
} from "../src/atlas/contracts";

test("Roslyn indexes exact declarations, overloads, partial types, and generated source", () => {
  const assembly = path.resolve(
    process.cwd(),
    "cartographer",
    "KrakenAtlas.Cartographer",
    "bin",
    "Release",
    "net10.0",
    "KrakenAtlas.Cartographer.dll"
  );
  const workspaceRoot = path.resolve(process.cwd(), "test-fixtures", "csharp-semantics");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-csharp-"));
  const atlasPath = path.join(temporaryRoot, "atlas.sqlite3");
  const invoke = <T>(command: string, ...extra: string[]): T => JSON.parse(execFileSync("dotnet", [
    assembly,
    command,
    "--workspace",
    workspaceRoot,
    "--atlas",
    atlasPath,
    ...extra
  ], { encoding: "utf8" })) as T;

  try {
    const build = invoke<BuildAtlasResult>("build");
    assert.equal(build.generation, 1);

    const summary = invoke<AtlasSummary>("summary");
    const roslyn = summary.analyzerRuns.find(run => run.analyzer === "roslyn");
    assert.equal(roslyn?.capability, "csharp.routes");
    assert.equal(roslyn?.status, "succeeded");

    const processors = invoke<SymbolSearchResult>("symbols", "--query", "Processor", "--limit", "50");
    const processorTypes = processors.matches.filter(match => match.kind === "class" && match.name === "Processor");
    assert.deepEqual(
      processorTypes.map(match => match.qualifiedName).sort(),
      ["SemanticFixture.Alpha.Processor", "SemanticFixture.Beta.Processor"]
    );
    assert.notEqual(processorTypes[0]?.stableKey, processorTypes[1]?.stableKey);
    const alphaProcessor = processorTypes.find(match =>
      match.qualifiedName === "SemanticFixture.Alpha.Processor");
    assert.ok(alphaProcessor);
    const processorTypeUses = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      alphaProcessor.stableKey,
      "--kind",
      "uses_type",
      "--limit",
      "20"
    );
    assert.ok(processorTypeUses.usages.some(usage =>
      usage.sourceQualifiedName.startsWith("SemanticFixture.Alpha.ProcessorConsumer")));

    const transforms = invoke<SymbolSearchResult>("symbols", "--query", "Transform", "--limit", "10");
    const overloads = transforms.matches.filter(match => match.kind === "method" && match.name === "Transform");
    assert.equal(overloads.length, 3);
    assert.equal(new Set(overloads.map(match => match.stableKey)).size, 3);
    assert.ok(overloads.some(match => match.signature.includes("string Transform(string input)")));
    assert.ok(overloads.some(match => match.signature.includes("int Transform(int input)")));

    const interfaceTransform = overloads.find(match =>
      match.qualifiedName === "SemanticFixture.Alpha.IProcessor.Transform(string)");
    assert.ok(interfaceTransform);
    const interfaceUsages = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      interfaceTransform.stableKey,
      "--limit",
      "10"
    );
    assert.deepEqual(
      interfaceUsages.usages.map(usage => usage.relationKind).sort(),
      ["calls", "implements_member"]
    );
    const interfaceCall = interfaceUsages.usages.find(usage => usage.relationKind === "calls");
    assert.equal(interfaceCall?.dispatchKind, "interface");
    assert.equal(interfaceCall?.sourceQualifiedName, "SemanticFixture.Alpha.ProcessorConsumer.Run(string)");
    assert.equal(interfaceCall?.evidence.relativePath, "Alpha/ProcessorConsumer.cs");
    assert.ok(interfaceUsages.usages.every(usage => !usage.evidence.relativePath.endsWith("README.md")));

    const filteredCalls = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      interfaceTransform.stableKey,
      "--kind",
      "calls",
      "--limit",
      "10"
    );
    assert.deepEqual(filteredCalls.usages.map(usage => usage.relationKind), ["calls"]);
    const boundedUsages = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      interfaceTransform.stableKey,
      "--limit",
      "1"
    );
    assert.equal(boundedUsages.usages.length, 1);
    assert.equal(boundedUsages.truncated, true);

    const processorContract = invoke<SymbolSearchResult>("symbols", "--query", "IProcessor", "--limit", "10")
      .matches.find(match => match.kind === "interface");
    assert.ok(processorContract);
    const implementers = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      processorContract.stableKey,
      "--kind",
      "implements",
      "--limit",
      "10"
    );
    assert.ok(implementers.usages.some(usage =>
      usage.sourceQualifiedName === "SemanticFixture.Alpha.Processor"));

    const describes = invoke<SymbolSearchResult>("symbols", "--query", "Describe", "--limit", "10");
    const baseDescribe = describes.matches.find(match =>
      match.qualifiedName === "SemanticFixture.Alpha.ProcessorBase.Describe()");
    assert.ok(baseDescribe);
    const overrides = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      baseDescribe.stableKey,
      "--kind",
      "overrides",
      "--limit",
      "10"
    );
    assert.ok(overrides.usages.some(usage =>
      usage.sourceQualifiedName === "SemanticFixture.Alpha.Processor.Describe()"));
    const baseType = invoke<SymbolSearchResult>("symbols", "--query", "ProcessorBase", "--limit", "10")
      .matches.find(match => match.kind === "class");
    assert.ok(baseType);
    const derivedTypes = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      baseType.stableKey,
      "--kind",
      "inherits",
      "--limit",
      "10"
    );
    assert.ok(derivedTypes.usages.some(usage =>
      usage.sourceQualifiedName === "SemanticFixture.Alpha.Processor"));

    const names = invoke<SymbolSearchResult>("symbols", "--query", "Name", "--limit", "20");
    const processorName = names.matches.find(match =>
      match.qualifiedName === "SemanticFixture.Alpha.Processor.Name");
    assert.ok(processorName);
    const nameUsages = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      processorName.stableKey,
      "--limit",
      "20"
    );
    assert.ok(nameUsages.usages.some(usage => usage.relationKind === "writes"));
    assert.ok(nameUsages.usages.some(usage => usage.relationKind === "reads"));

    const constructors = invoke<SymbolSearchResult>("symbols", "--query", "Processor", "--limit", "50");
    const processorConstructor = constructors.matches.find(match =>
      match.kind === "constructor" && match.qualifiedName === "SemanticFixture.Alpha.Processor.Processor()");
    assert.ok(processorConstructor);
    const constructions = invoke<CodeUsageResult>(
      "usages",
      "--stable-key",
      processorConstructor.stableKey,
      "--kind",
      "constructs",
      "--limit",
      "10"
    );
    assert.equal(constructions.usages[0]?.sourceQualifiedName, "SemanticFixture.Alpha.ProcessorConsumer.Run(string)");

    const partials = invoke<SymbolSearchResult>("symbols", "--query", "PartialService", "--limit", "10");
    const partial = partials.matches.find(match => match.kind === "class" && match.name === "PartialService");
    assert.ok(partial);
    assert.equal(partial.definitionCount, 2);
    const partialEntity = invoke<EntityDetail>("entity", "--stable-key", partial.stableKey);
    assert.deepEqual(
      partialEntity.locations.map(location => location.relativePath).sort(),
      ["PartialService.Part1.cs", "PartialService.Part2.cs"]
    );

    const generated = invoke<SymbolSearchResult>("symbols", "--query", "GeneratedClient", "--limit", "10");
    const generatedType = generated.matches.find(match => match.kind === "class" && match.name === "GeneratedClient");
    assert.equal(generatedType?.firstDefinition?.isGenerated, true);

    const bounded = invoke<SymbolSearchResult>("symbols", "--query", "Processor", "--limit", "1");
    assert.equal(bounded.matches.length, 1);
    assert.equal(bounded.truncated, true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
