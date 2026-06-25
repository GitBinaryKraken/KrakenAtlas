import * as assert from "assert";
import * as path from "path";
import test from "node:test";
import { renderWorkspaceCliShimScripts } from "../src/agent/workspaceCliShim";

test("workspace CLI shims resolve the latest installed extension before fallback", () => {
  const extensionPath = path.join("C:", "Users", "Crimson", ".vscode", "extensions", "binarykraken.kraken-atlas-0.1.14");
  const scripts = renderWorkspaceCliShimScripts(extensionPath);

  assert.match(scripts.cmd, /binarykraken\.kraken-atlas-\*/);
  assert.match(scripts.cmd, /Sort-Object Version -Descending/);
  assert.match(scripts.cmd, /KRAKEN_ATLAS_FALLBACK/);
  assert.match(scripts.cmd, /Run "Kraken Atlas: Install CLI For Workspace Terminals"/);
  assert.doesNotMatch(scripts.cmd, /^@echo off\r\nnode "/);

  assert.match(scripts.ps1, /binarykraken\.kraken-atlas-\*/);
  assert.match(scripts.ps1, /Sort-Object Version -Descending/);
  assert.match(scripts.ps1, /Kraken Atlas CLI shim target was not found/);

  assert.match(scripts.sh, /binarykraken\.kraken-atlas-\*/);
  assert.match(scripts.sh, /sort -V/);
  assert.match(scripts.sh, /Kraken Atlas CLI shim target was not found/);
});
