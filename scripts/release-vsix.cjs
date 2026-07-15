#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const artifact = path.resolve(root, "..", "pack-artifacts", `${manifest.name}-${manifest.version}.vsix`);

for (const args of [
  ["run", "release:check-version"],
  ["test"],
  ["run", "publish:cartographer"],
  ["run", "package:vsix"],
  ["run", "smoke:vsix"]
]) {
  const result = spawnSync("npm", args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(artifact)) {
  console.error(`Expected VSIX was not created: ${artifact}`);
  process.exit(1);
}

console.log(`Release artifact ready: ${artifact}`);
