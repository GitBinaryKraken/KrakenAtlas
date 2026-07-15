import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020";

test("packages the approved plan and keeps code usages separate from documentation", () => {
  const planningRoot = path.resolve(process.cwd(), "docs", "planning");
  const required = [
    "AGENT_QUERY_REQUIREMENTS.md",
    "AI_SELF_ENRICHMENT.md",
    "ARCHITECTURE.md",
    "ATLAS_MODEL.md",
    "BENCHMARKS.md",
    "DECISIONS.md",
    "FEATURE_IMPLEMENTATION_WORKFLOW.md",
    "NODE_DECORATION_COMMAND.md",
    "NODE_KNOWLEDGE_MODEL.md",
    "PRODUCT.md",
    "ROADMAP.md"
  ];

  for (const file of required) {
    assert.equal(fs.existsSync(path.join(planningRoot, file)), true, `${file} should exist`);
  }

  const agentQueries = fs.readFileSync(path.join(planningRoot, "AGENT_QUERY_REQUIREMENTS.md"), "utf8");
  assert.match(agentQueries, /find_usages/);
  assert.match(agentQueries, /get_documentation_for_entity/);
  assert.match(agentQueries, /must not contain README, ADR, or runbook\s+mentions/);

  const featureWorkflow = fs.readFileSync(
    path.join(planningRoot, "FEATURE_IMPLEMENTATION_WORKFLOW.md"),
    "utf8"
  );
  assert.match(featureWorkflow, /find_similar_features/);
  assert.match(featureWorkflow, /must_change/);
  assert.match(featureWorkflow, /Value Flow/);

  const atlasModel = fs.readFileSync(path.join(planningRoot, "ATLAS_MODEL.md"), "utf8");
  assert.match(atlasModel, /get_workspace_orientation/);
  assert.match(atlasModel, /project_facets/);
  assert.match(atlasModel, /workspace_commands/);
  assert.match(atlasModel, /repository_rules/);

  const product = fs.readFileSync(path.join(planningRoot, "PRODUCT.md"), "utf8");
  assert.match(product, /Complete Workspace Orientation/);
  assert.match(product, /get_workspace_orientation/);

  const nodeKnowledge = fs.readFileSync(
    path.join(planningRoot, "NODE_KNOWLEDGE_MODEL.md"),
    "utf8"
  );
  assert.match(nodeKnowledge, /get_entity_context/);
  assert.match(nodeKnowledge, /analysis_sessions/);
  assert.match(nodeKnowledge, /assessment_claims/);
  assert.match(nodeKnowledge, /assessment_dependencies/);
  assert.match(nodeKnowledge, /private chain-of-thought/);

  const decorationCommand = fs.readFileSync(
    path.join(planningRoot, "NODE_DECORATION_COMMAND.md"),
    "utf8"
  );
  assert.match(decorationCommand, /decorate_nodes/);
  assert.match(decorationCommand, /expectedAtlasGeneration/);
  assert.match(decorationCommand, /capture_from_evidence/);

  const selfEnrichment = fs.readFileSync(
    path.join(planningRoot, "AI_SELF_ENRICHMENT.md"),
    "utf8"
  );
  assert.match(selfEnrichment, /classify_role/);
  assert.match(selfEnrichment, /add_membership/);
  assert.match(selfEnrichment, /domain_logic/);
  assert.match(selfEnrichment, /review_assessment/);

  const contractRoot = path.join(planningRoot, "contracts");
  const decorationSchema = JSON.parse(
    fs.readFileSync(path.join(contractRoot, "node-decoration-batch.schema.json"), "utf8")
  ) as {
    $schema: string;
    properties: {
      schemaVersion: { const: string };
      decorations: { items: { $ref: string } };
    };
    $defs: {
      decoration: { required: string[] };
      classifyRoleUpdate: { properties: { kind: { const: string } } };
      addMembershipUpdate: { properties: { kind: { const: string } } };
      reportKnowledgeGapUpdate: { properties: { kind: { const: string } } };
    };
  };
  const decorationExample = JSON.parse(
    fs.readFileSync(path.join(contractRoot, "node-decoration-batch.example.json"), "utf8")
  ) as {
    schemaVersion: string;
    decorations: Array<{
      clientUpdateId: string;
      update: { kind: string };
      evidence: unknown[];
      dependencyPolicy: string;
      [key: string]: unknown;
    }>;
  };

  assert.equal(decorationSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(decorationSchema.properties.schemaVersion.const, "1.0");
  assert.equal(decorationSchema.properties.decorations.items.$ref, "#/$defs/decoration");
  assert.ok(decorationSchema.$defs.decoration.required.includes("evidence"));
  assert.ok(decorationSchema.$defs.decoration.required.includes("update"));
  assert.equal(decorationSchema.$defs.classifyRoleUpdate.properties.kind.const, "classify_role");
  assert.equal(decorationSchema.$defs.addMembershipUpdate.properties.kind.const, "add_membership");
  assert.equal(
    decorationSchema.$defs.reportKnowledgeGapUpdate.properties.kind.const,
    "report_knowledge_gap"
  );
  assert.equal(decorationExample.schemaVersion, "1.0");
  assert.ok(decorationExample.decorations.length > 0);
  assert.ok(decorationExample.decorations.every((item) => item.clientUpdateId.length > 0));
  assert.ok(decorationExample.decorations.some((item) => item.update.kind === "classify_role"));
  assert.ok(decorationExample.decorations.some((item) => item.update.kind === "add_membership"));
  assert.ok(decorationExample.decorations.every((item) => item.evidence.length > 0));
  assert.ok(decorationExample.decorations.every(
    (item) => item.dependencyPolicy === "capture_from_evidence"
  ));

  const validator = new Ajv2020({ allErrors: true, strict: true });
  const validateDecorationBatch = validator.compile(decorationSchema);
  assert.equal(
    validateDecorationBatch(decorationExample),
    true,
    validator.errorsText(validateDecorationBatch.errors)
  );

  const genericPropertyBag = JSON.parse(JSON.stringify(decorationExample)) as typeof decorationExample;
  genericPropertyBag.decorations[0].dimension = "feature";
  assert.equal(validateDecorationBatch(genericPropertyBag), false);
});
