import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";

test("packages the approved plan and keeps code usages separate from documentation", () => {
  const planningRoot = path.resolve(process.cwd(), "docs", "planning");
  const required = [
    "AGENT_QUERY_REQUIREMENTS.md",
    "ARCHITECTURE.md",
    "ATLAS_MODEL.md",
    "BENCHMARKS.md",
    "DECISIONS.md",
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
});
