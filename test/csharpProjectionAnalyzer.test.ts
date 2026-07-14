import * as assert from "assert";
import test from "node:test";
import { analyzeCSharpModelProjections } from "../src/analyzers/csharpProjectionAnalyzer";
import type { RelationshipRecord, SourceRange, SymbolRecord } from "../src/model/records";

test("C# projection analyzer synthesizes type-level model projection edges from property maps", () => {
  const symbols: SymbolRecord[] = [
    symbol("symbol:csharp:Domain.PersonaInfoFieldDataModel", "PersonaInfoFieldDataModel", "Domain.PersonaInfoFieldDataModel", "class"),
    symbol("symbol:csharp:Domain.PersonaInfoFieldDataModel.TypeCode", "TypeCode", "Domain.PersonaInfoFieldDataModel.TypeCode", "property"),
    symbol("symbol:csharp:Domain.PersonaInfoFieldDataModel.Title", "Title", "Domain.PersonaInfoFieldDataModel.Title", "property"),
    symbol("symbol:csharp:Api.PersonaDetailFieldViewModel", "PersonaDetailFieldViewModel", "Api.PersonaDetailFieldViewModel", "class"),
    symbol("symbol:csharp:Api.PersonaDetailFieldViewModel.TypeCode", "TypeCode", "Api.PersonaDetailFieldViewModel.TypeCode", "property"),
    symbol("symbol:csharp:Api.PersonaDetailFieldViewModel.Title", "Title", "Api.PersonaDetailFieldViewModel.Title", "property"),
    symbol("symbol:csharp:Api.PersonaMappingExtensions.ToViewModel(Domain.PersonaInfoFieldDataModel)", "ToViewModel", "Api.PersonaMappingExtensions.ToViewModel(Domain.PersonaInfoFieldDataModel)", "method")
  ];
  const relationships: RelationshipRecord[] = [
    relationship(
      "symbol:csharp:Domain.PersonaInfoFieldDataModel.TypeCode",
      "symbol:csharp:Api.PersonaDetailFieldViewModel.TypeCode",
      "TypeCode = data.TypeCode",
      12
    ),
    relationship(
      "symbol:csharp:Domain.PersonaInfoFieldDataModel.Title",
      "symbol:csharp:Api.PersonaDetailFieldViewModel.Title",
      "Title = data.Title",
      13
    ),
    relationship(
      "symbol:csharp:Api.PersonaMappingExtensions.ToViewModel(Domain.PersonaInfoFieldDataModel)",
      "symbol:csharp:Api.PersonaDetailFieldViewModel.Title",
      "Title = data.Title",
      13
    )
  ];

  const result = analyzeCSharpModelProjections(symbols, relationships);

  assert.strictEqual(result.relationships.length, 1);
  assert.strictEqual(result.relationships[0]?.type, "PROJECTS_MODEL");
  assert.strictEqual(result.relationships[0]?.from, "symbol:csharp:Domain.PersonaInfoFieldDataModel");
  assert.strictEqual(result.relationships[0]?.to, "symbol:csharp:Api.PersonaDetailFieldViewModel");
  assert.match(result.relationships[0]?.evidence ?? "", /TypeCode->TypeCode/);
  assert.match(result.relationships[0]?.evidence ?? "", /Title->Title/);
});

function symbol(id: string, name: string, fullyQualifiedName: string, kind: string): SymbolRecord {
  return {
    recordType: "symbol",
    id,
    name,
    fullyQualifiedName,
    kind,
    language: "csharp",
    file: kind === "class" || kind === "property" && id.includes("Domain.") ? "Domain/PersonaInfoFieldDataModel.cs" : "Api/PersonaMappingExtensions.cs",
    range: range(1),
    confidence: 0.9
  };
}

function relationship(from: string, to: string, evidence: string, line: number): RelationshipRecord {
  return {
    recordType: "relationship",
    id: `relationship:test:${line}:${from}->${to}`,
    from,
    to,
    type: "MAPS_PROPERTY",
    file: "Api/PersonaMappingExtensions.cs",
    range: range(line),
    evidence,
    confidence: 0.82
  };
}

function range(line: number): SourceRange {
  return { startLine: line, startColumn: 1, endLine: line, endColumn: 30 };
}
