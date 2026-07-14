import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { withQueryService } from "../src/query/queryService";
import { rebuildProject } from "../src/rebuild/rebuildProject";
import { updateProject } from "../src/rebuild/updateProject";

test("rebuildProject writes the reduced relationship-map contract", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "dotnet-simple");
  const workspaceRoot = await copyFixture(fixtureRoot, "kraken-atlas-rebuild-core-");

  const result = await rebuildProject({ extensionPath: projectRoot, workspaceRoot });
  const outputRoot = path.join(workspaceRoot, ".kraken-atlas");
  const manifest = JSON.parse(await fs.readFile(path.join(outputRoot, "manifest.json"), "utf8"));

  assert.ok(result.symbolCount > 0);
  assert.ok(result.referenceCount > 0);
  assert.ok(result.relationshipCount > 0);
  assert.deepStrictEqual(Object.keys(manifest.outputs).sort(), ["files", "project", "references", "relationships", "sqlite", "symbols"].sort());
  await assert.rejects(fs.access(path.join(outputRoot, "patterns.jsonl")));
  await assert.rejects(fs.access(path.join(outputRoot, "findings.jsonl")));
});

test("rebuilt .NET fixture is queryable by direct relationships", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "dotnet-simple");
  const workspaceRoot = await copyFixture(fixtureRoot, "kraken-atlas-query-dotnet-");

  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });
  await withQueryService(workspaceRoot, (service) => {
    const relationships = service.findRelationships("IUserService");
    const references = service.findReferences("IUserService");
    const flow = service.findFlow("UserController GetUser");

    assert.ok(relationships.relationships.some((edge) => edge.type === "IMPLEMENTS"));
    assert.ok(relationships.relationships.some((edge) => edge.type === "INJECTS"));
    assert.ok(references.evidence.some((item) => item.recordType === "reference"));
    assert.ok(flow.relationships.some((edge) => edge.type === "CALLS"));
  });
});

test("updateProject skips an unchanged relationship map", async () => {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureRoot = path.join(projectRoot, "test-fixtures", "dotnet-simple");
  const workspaceRoot = await copyFixture(fixtureRoot, "kraken-atlas-update-core-");

  await rebuildProject({ extensionPath: projectRoot, workspaceRoot });
  const result = await updateProject({ extensionPath: projectRoot, workspaceRoot });

  assert.strictEqual(result.mode, "skipped");
  assert.match(result.reason, /No file hash changes/);
});

async function copyFixture(source: string, prefix: string): Promise<string> {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.cp(source, destination, { recursive: true });
  return destination;
}
