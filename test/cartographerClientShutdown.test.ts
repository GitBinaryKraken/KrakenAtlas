import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { CartographerClient, waitForProcessExit } from "../src/cartographer/client";

test("waitForProcessExit resolves only after the process exits", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 100)"], {
    stdio: "pipe",
    windowsHide: true
  });
  const started = Date.now();

  assert.equal(await waitForProcessExit(child, 2_000), true);
  assert.ok(Date.now() - started >= 50);
  assert.notEqual(child.exitCode, null);
});

test("waitForProcessExit reports a timeout without losing the later exit", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1_000)"], {
    stdio: "pipe",
    windowsHide: true
  });

  try {
    assert.equal(await waitForProcessExit(child, 25), false);
  } finally {
    child.kill();
    assert.equal(await waitForProcessExit(child, 2_000), true);
  }
});

test("CartographerClient restart and shutdown release the Cartographer assembly", async () => {
  const repositoryRoot = process.cwd();
  const assemblyCandidates = [
    path.join(repositoryRoot, "cartographer", "KrakenAtlas.Cartographer", "publish", "KrakenAtlas.Cartographer.dll"),
    path.join(repositoryRoot, "cartographer", "KrakenAtlas.Cartographer", "bin", "Release", "net10.0", "KrakenAtlas.Cartographer.dll")
  ];
  const assembly = assemblyCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(assembly, "Cartographer should be built before the Node test suite runs");

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-client-shutdown-"));
  const movedAssembly = `${assembly}.shutdown-test-${process.pid}`;
  const client = new CartographerClient(
    repositoryRoot,
    [],
    path.join(temporaryRoot, "atlas.sqlite3"),
    () => undefined
  );

  try {
    await client.getFoundationStatus();
    await client.restart();
    await client.getFoundationStatus();
    await client.shutdown();
    fs.renameSync(assembly, movedAssembly);
    fs.renameSync(movedAssembly, assembly);
  } finally {
    await client.shutdown();
    if (fs.existsSync(movedAssembly) && !fs.existsSync(assembly)) {
      fs.renameSync(movedAssembly, assembly);
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
