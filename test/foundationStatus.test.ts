import { strict as assert } from "node:assert";
import test from "node:test";
import { renderFoundationStatus } from "../src/foundation/status";

test("renders a ready Cartographer before the first Atlas build", () => {
  const output = renderFoundationStatus({
    phase: "walking_cartographer",
    cartographerState: "available",
    atlasState: "not_created",
    indexingState: "not_started",
    message: "Cartographer is ready. Build the Atlas to discover workspace projects and files."
  }, "0.3.0");

  assert.match(output, /Kraken Atlas 0\.3\.0/);
  assert.match(output, /Cartographer: available/);
  assert.match(output, /Atlas: not_created/);
  assert.match(output, /ready/i);
});
