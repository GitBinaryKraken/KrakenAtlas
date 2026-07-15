#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const extensionId = `${manifest.publisher}.${manifest.name}`;
const expectedListing = `${extensionId}@${manifest.version}`.toLowerCase();
const artifact = path.resolve(
  root,
  "..",
  "pack-artifacts",
  `${manifest.name}-${manifest.version}.vsix`
);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-atlas-vsix-smoke-"));
const userDataDirectory = path.join(temporaryRoot, "user-data");
const extensionsDirectory = path.join(temporaryRoot, "extensions");
const workspaceRoot = path.join(temporaryRoot, "workspace");
const atlasPath = path.join(temporaryRoot, "atlas", "atlas.sqlite3");
const vscodeCli = process.env.VSCODE_CLI || "code";
let vscodeInvocation;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}` +
        (detail ? `:\n${detail}` : "")
    );
  }

  return (result.stdout || "").trim();
}

function code(args) {
  const cliArgs = [
    "--user-data-dir",
    userDataDirectory,
    "--extensions-dir",
    extensionsDirectory,
    ...args
  ];
  if (process.platform !== "win32") {
    return run(vscodeCli, cliArgs);
  }

  vscodeInvocation ||= resolveWindowsVsCodeInvocation();
  return run(vscodeInvocation.command, [vscodeInvocation.cliScript, ...cliArgs], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      VSCODE_DEV: ""
    }
  });
}

function resolveWindowsVsCodeInvocation() {
  let launcher = vscodeCli;
  if (!path.isAbsolute(launcher)) {
    const located = run("where.exe", [launcher]).split(/\r?\n/).filter(Boolean);
    launcher = located.find(candidate => candidate.toLowerCase().endsWith(".cmd")) ?? located[0];
  }

  if (!launcher) {
    throw new Error("The VS Code CLI was not found. Set VSCODE_CLI to its code.cmd path.");
  }

  const installRoot = path.resolve(path.dirname(launcher), "..");
  const command = path.join(installRoot, "Code.exe");
  const cliCandidates = [path.join(installRoot, "resources", "app", "out", "cli.js")];
  for (const entry of fs.readdirSync(installRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      cliCandidates.push(path.join(installRoot, entry.name, "resources", "app", "out", "cli.js"));
    }
  }
  const cliScript = cliCandidates.find(candidate => fs.existsSync(candidate));

  if (!fs.existsSync(command) || !cliScript) {
    throw new Error(`Could not resolve Code.exe and cli.js from VS Code launcher: ${launcher}`);
  }

  return { command, cliScript };
}

function cartographer(assembly, command) {
  const output = run("dotnet", [
    assembly,
    command,
    "--workspace",
    workspaceRoot,
    "--atlas",
    atlasPath
  ]);
  return JSON.parse(output);
}

function findInstalledExtensionRoot() {
  for (const entry of fs.readdirSync(extensionsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(extensionsDirectory, entry.name);
    const manifestPath = path.join(candidate, "package.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const candidateManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (
      String(candidateManifest.publisher).toLowerCase() === String(manifest.publisher).toLowerCase() &&
      String(candidateManifest.name).toLowerCase() === String(manifest.name).toLowerCase() &&
      candidateManifest.version === manifest.version
    ) {
      return candidate;
    }
  }
  return undefined;
}

function removeTemporaryRoot() {
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedTarget = path.resolve(temporaryRoot);
  const expectedPrefix = `${resolvedTemp}${path.sep}`;

  if (
    !resolvedTarget.startsWith(expectedPrefix) ||
    !path.basename(resolvedTarget).startsWith("kraken-atlas-vsix-smoke-")
  ) {
    throw new Error(`Refusing to remove unexpected smoke-test directory: ${resolvedTarget}`);
  }

  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

let installed = false;

try {
  if (!fs.existsSync(artifact)) {
    throw new Error(`Expected VSIX does not exist. Run npm run check:vsix first: ${artifact}`);
  }

  fs.cpSync(path.join(root, "test-fixtures", "workspace-discovery"), workspaceRoot, {
    recursive: true
  });

  code(["--install-extension", artifact, "--force"]);
  installed = true;

  const listing = code(["--list-extensions", "--show-versions"])
    .split(/\r?\n/)
    .map(line => line.trim().toLowerCase());
  if (!listing.includes(expectedListing)) {
    throw new Error(`Isolated profile did not list ${extensionId}@${manifest.version}.`);
  }

  const extensionRoot = findInstalledExtensionRoot();
  if (!extensionRoot) {
    throw new Error(`The isolated extension directory did not contain ${extensionId}.`);
  }

  const installedManifest = JSON.parse(
    fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")
  );
  if (installedManifest.version !== manifest.version) {
    throw new Error(
      `Installed extension version ${installedManifest.version} does not match ${manifest.version}.`
    );
  }

  const assembly = path.join(
    extensionRoot,
    "cartographer",
    "KrakenAtlas.Cartographer",
    "publish",
    "KrakenAtlas.Cartographer.dll"
  );
  if (!fs.existsSync(assembly)) {
    throw new Error(`Packaged Cartographer assembly is missing: ${assembly}`);
  }

  const firstBuild = cartographer(assembly, "build");
  if (firstBuild.generation !== 1 || firstBuild.counts?.projects !== 2 || firstBuild.counts?.files !== 7) {
    throw new Error(`Unexpected first Atlas build result: ${JSON.stringify(firstBuild)}`);
  }

  const reopened = cartographer(assembly, "summary");
  if (reopened.generation !== 1 || reopened.counts?.projects !== 2 || reopened.counts?.files !== 7) {
    throw new Error(`Atlas did not reopen correctly: ${JSON.stringify(reopened)}`);
  }

  const secondBuild = cartographer(assembly, "build");
  if (secondBuild.generation !== 2) {
    throw new Error(`Cartographer restart build did not advance the generation: ${JSON.stringify(secondBuild)}`);
  }

  code(["--uninstall-extension", extensionId]);
  installed = false;

  const afterUninstall = code(["--list-extensions", "--show-versions"]).toLowerCase();
  if (afterUninstall.includes(extensionId.toLowerCase())) {
    throw new Error(`${extensionId} remained installed in the isolated profile.`);
  }

  console.log(
    `VSIX smoke test passed: installed ${extensionId}@${manifest.version}, built and reopened two Atlas generations, then uninstalled it.`
  );
} finally {
  if (installed) {
    try {
      code(["--uninstall-extension", extensionId]);
    } catch {
      // Preserve the original test failure; the isolated directory is removed below.
    }
  }
  removeTemporaryRoot();
}
