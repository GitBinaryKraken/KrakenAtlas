#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const artifactPath = path.resolve(projectRoot, "..", "pack-artifacts", `${packageJson.name}-${packageJson.version}.vsix`);
const npmCommand = "npm";

run(npmCommand, ["run", "release:check-version"]);
run(npmCommand, ["test"]);
run(npmCommand, ["run", "publish:analyzer"]);
run(npmCommand, ["run", "package:vsix"]);

if (!fs.existsSync(artifactPath)) {
  console.error(`Expected VSIX was not created: ${artifactPath}`);
  process.exit(1);
}

const stats = fs.statSync(artifactPath);
console.log("");
console.log("Release artifact ready:");
console.log(`Version: ${packageJson.version}`);
console.log(`VSIX: ${artifactPath}`);
console.log(`Size: ${stats.size} bytes`);
console.log(`Install: code --install-extension "${artifactPath}" --force`);

function run(command, args) {
  const result = process.platform === "win32"
    ? spawnSync([command, ...args].join(" "), {
        cwd: projectRoot,
        stdio: "inherit",
        shell: true
      })
    : spawnSync(command, args, {
        cwd: projectRoot,
        stdio: "inherit"
      });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
