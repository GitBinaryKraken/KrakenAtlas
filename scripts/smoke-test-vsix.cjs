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

function cartographer(assembly, command, ...extra) {
  const output = run("dotnet", [
    assembly,
    command,
    "--workspace",
    workspaceRoot,
    "--atlas",
    atlasPath,
    ...extra
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

  fs.cpSync(path.join(root, "test-fixtures", "dotnet-feature-flow"), workspaceRoot, {
    recursive: true,
    filter: source => !source.split(path.sep).some(part => part === "bin" || part === "obj")
  });
  run("dotnet", ["restore", path.join(workspaceRoot, "FeatureFlow.slnx")]);

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
  if (firstBuild.generation !== 1 || firstBuild.counts?.projects !== 7 || firstBuild.counts?.files !== 19) {
    throw new Error(`Unexpected first Atlas build result: ${JSON.stringify(firstBuild)}`);
  }

  const reopened = cartographer(assembly, "summary");
  if (reopened.generation !== 1 || reopened.counts?.projects !== 7 || reopened.counts?.files !== 19) {
    throw new Error(`Atlas did not reopen correctly: ${JSON.stringify(reopened)}`);
  }

  const orientation = cartographer(assembly, "orientation");
  if (
    orientation.atlasState !== "current" ||
    orientation.projects?.length !== 7 ||
    orientation.commands?.length < 8 ||
    !orientation.coverage?.includedSources?.includes("dotnet_projects")
  ) {
    throw new Error(`Packaged workspace orientation was incomplete: ${JSON.stringify(orientation)}`);
  }

  const searchEntity = (query, kind, qualifiedName) => {
    const result = cartographer(
      assembly,
      "search",
      "--query",
      query,
      "--kind",
      kind,
      "--limit",
      "50"
    );
    const entity = result.matches?.find(match => match.qualifiedName === qualifiedName);
    if (!entity) {
      throw new Error(`Packaged entity search did not find ${qualifiedName}: ${JSON.stringify(result)}`);
    }
    return entity;
  };
  const source = searchEntity(
    "PersonaController.Index",
    "method",
    "FeatureFlow.WebUI.PersonaController.Index(string, System.Threading.CancellationToken)"
  );
  const waypoint = searchEntity(
    "IPersonaConnector.GetPublicPersonaAsync",
    "method",
    "FeatureFlow.Connector.IPersonaConnector.GetPublicPersonaAsync(string, System.Threading.CancellationToken)"
  );
  const endpoint = searchEntity("GET /Persona", "http_endpoint", "GET /Persona");
  const target = searchEntity("public.personas", "database_object", "public.personas");
  const relations = cartographer(
    assembly,
    "relations",
    "--stable-key",
    endpoint.stableKey,
    "--direction",
    "both",
    "--limit",
    "20"
  );
  if (
    relations.atlasState !== "current" ||
    !relations.relations?.some(relation => relation.kind === "handled_by") ||
    !relations.relations?.some(relation => relation.kind === "matches_endpoint")
  ) {
    throw new Error(`Packaged relation query was incomplete: ${JSON.stringify(relations)}`);
  }

  const route = cartographer(
    assembly,
    "route",
    "--source-key",
    source.stableKey,
    "--via-key",
    waypoint.stableKey,
    "--target-key",
    target.stableKey,
    "--max-depth",
    "16",
    "--max-visited",
    "5000"
  );
  const expectedKinds = [
    "calls",
    "dispatches_to",
    "sends_http",
    "matches_endpoint",
    "handled_by",
    "calls",
    "dispatches_to",
    "calls",
    "dispatches_to",
    "executes_sql",
    "reads"
  ];
  if (
    route.atlasState !== "current" ||
    route.found !== true ||
    route.graphTruncated !== false ||
    JSON.stringify(route.steps?.map(step => step.relation.kind)) !== JSON.stringify(expectedKinds)
  ) {
    throw new Error(`Packaged Persona Route was incomplete: ${JSON.stringify(route)}`);
  }

  const logicMethod = searchEntity(
    "FeatureFlow.Logic.PersonaService.GetPublicPersonaAsync",
    "method",
    "FeatureFlow.Logic.PersonaService.GetPublicPersonaAsync(string, System.Threading.CancellationToken)"
  );
  const surface = cartographer(
    assembly,
    "surface",
    "--stable-key",
    logicMethod.stableKey,
    "--max-depth",
    "2",
    "--max-entities",
    "100"
  );
  if (
    surface.atlasState !== "current" ||
    surface.truncated !== false ||
    !surface.relatedTests?.some(item => item.entity.kind === "test_case") ||
    !surface.verificationCommands?.some(command => command.kind === "test")
  ) {
    throw new Error(`Packaged change surface was incomplete: ${JSON.stringify(surface)}`);
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
    `VSIX smoke test passed: installed ${extensionId}@${manifest.version}, traced the packaged 11-hop Persona Route and its test-aware change surface, built and reopened two Atlas generations, then uninstalled it.`
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
