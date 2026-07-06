#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const projectRoot = path.resolve(__dirname, "..");
const artifactDir = path.resolve(projectRoot, "..", "pack-artifacts");
const args = process.argv.slice(2);
const writeIndex = args.indexOf("--write");
const outputPath = writeIndex >= 0 && args[writeIndex + 1]
  ? path.resolve(process.cwd(), args[writeIndex + 1])
  : null;

const artifacts = fs.existsSync(artifactDir)
  ? fs.readdirSync(artifactDir)
      .filter((name) => /^kraken-atlas-\d+\.\d+\.\d+\.vsix$/.test(name))
      .sort(compareArtifactNames)
  : [];

const releases = artifacts.map(readRelease);
const markdown = renderMarkdown(releases);

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, "utf8");
  console.log(`Wrote ${outputPath}`);
} else {
  console.log(markdown);
}

function readRelease(fileName) {
  const filePath = path.join(artifactDir, fileName);
  const entries = readZipEntries(filePath);
  const packageJson = parseJson(readZipText(entries, "extension/package.json"));
  const changelog = readZipText(entries, "extension/CHANGELOG.md");
  const readme = readZipText(entries, "extension/README.md");
  const version = packageJson?.version ?? fileName.replace(/^kraken-atlas-/, "").replace(/\.vsix$/, "");
  const notes = redactPrivateFixtureTerms(extractChangelogSection(changelog, version));
  const readmeHeading = redactPrivateFixtureTerms(firstMatch(readme, /^## What's New[^\n\r]*/m));

  return {
    fileName,
    version,
    hasChangelog: Boolean(changelog),
    hasVersionNotes: Boolean(notes),
    readmeHeading,
    notes
  };
}

function renderMarkdown(releases) {
  const lines = [
    "# Kraken Atlas Packaged Release History Audit",
    "",
    `Source: \`${artifactDir}\``,
    "",
    "| Version | VSIX | Packaged Changelog | Version Notes | README Release Heading |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const release of releases) {
    lines.push(`| ${release.version} | ${release.fileName} | ${yesNo(release.hasChangelog)} | ${yesNo(release.hasVersionNotes)} | ${escapeTable(release.readmeHeading || "")} |`);
  }

  const missing = releases.filter((release) => !release.hasVersionNotes);
  if (missing.length) {
    lines.push("", "## Missing Packaged Changelog Notes", "");
    for (const release of missing) {
      lines.push(`- ${release.version}: ${release.hasChangelog ? "changelog exists but no matching version section was found" : "no packaged changelog was found"}.`);
    }
  }

  lines.push("", "## Extracted Notes", "");
  for (const release of releases.filter((item) => item.hasVersionNotes).reverse()) {
    lines.push(`### ${release.version}`, "", release.notes, "");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function readZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid central directory in ${filePath}`);
    }

    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    entries.set(fileName, {
      buffer,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipText(entries, entryName) {
  const entry = entries.get(entryName);
  if (!entry) {
    return "";
  }

  const localOffset = entry.localHeaderOffset;
  if (entry.buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entryName}`);
  }
  const fileNameLength = entry.buffer.readUInt16LE(localOffset + 26);
  const extraLength = entry.buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = entry.buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compression === 0) {
    return compressed.toString("utf8");
  }
  if (entry.compression === 8) {
    const inflated = zlib.inflateRawSync(compressed);
    if (inflated.length !== entry.uncompressedSize) {
      throw new Error(`Unexpected inflated size for ${entryName}`);
    }
    return inflated.toString("utf8");
  }

  throw new Error(`Unsupported zip compression ${entry.compression} for ${entryName}`);
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("Could not find zip end of central directory.");
}

function extractChangelogSection(changelog, version) {
  if (!changelog) {
    return "";
  }
  const escaped = version.replace(/\./g, "\\.");
  const match = new RegExp(`^## ${escaped}\\s*([\\s\\S]*?)(?=^##\\s+\\d+\\.\\d+\\.\\d+|(?![\\s\\S]))`, "m").exec(changelog);
  return match?.[1]?.trim() ?? "";
}

function firstMatch(text, pattern) {
  return pattern.exec(text || "")?.[0] ?? "";
}

function parseJson(text) {
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

function compareArtifactNames(left, right) {
  return compareVersions(versionFromArtifact(left), versionFromArtifact(right));
}

function versionFromArtifact(fileName) {
  return fileName.replace(/^kraken-atlas-/, "").replace(/\.vsix$/, "");
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function escapeTable(value) {
  return value.replace(/\|/g, "\\|");
}

function redactPrivateFixtureTerms(value) {
  const privateRoot = ["Ke", "lp"].join("");
  return value
    .replace(new RegExp(`${privateRoot}2025_WebUI`, "g"), "ExampleWebUI")
    .replace(new RegExp(`${privateRoot}ApiLogicLayer`, "g"), "ExampleLogicLayer")
    .replace(new RegExp(`${privateRoot}ApiDomain`, "g"), "ExampleDomain")
    .replace(new RegExp(`${privateRoot}Api`, "g"), "ExampleApi")
    .replace(new RegExp(`${privateRoot}UserManager`, "g"), "UserManager")
    .replace(new RegExp(`${privateRoot}User`, "g"), "AppUser")
    .replace(new RegExp(`${privateRoot}/WebUI`, "g"), "WebUI")
    .replace(new RegExp(`${privateRoot}-style`, "g"), "production-style")
    .replace(new RegExp(`Real-${privateRoot}`, "g"), "Real-project")
    .replace(new RegExp(`${privateRoot} evaluation`, "g"), "multi-project evaluation")
    .replace(new RegExp(`${privateRoot} carousel retest`, "g"), "carousel retest")
    .replace(new RegExp(privateRoot, "g"), "private fixture");
}
