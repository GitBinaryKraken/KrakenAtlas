import * as path from "path";

export interface WorkspaceCliShimScripts {
  cmd: string;
  ps1: string;
  sh: string;
}

export function renderWorkspaceCliShimScripts(extensionPath: string): WorkspaceCliShimScripts {
  const fallbackCliPath = path.join(extensionPath, "dist", "cli.js");
  const psEscapedFallback = fallbackCliPath.replace(/'/g, "''");
  const shEscapedFallback = fallbackCliPath.replace(/'/g, "'\"'\"'");

  return {
    cmd: `@echo off\r\nsetlocal\r\nset "KRAKEN_ATLAS_FALLBACK=${fallbackCliPath}"\r\nfor /f "usebackq delims=" %%I in (\`powershell -NoProfile -ExecutionPolicy Bypass -Command "$base = Join-Path $env:USERPROFILE '.vscode\\extensions'; $latest = Get-ChildItem -LiteralPath $base -Directory -Filter 'binarykraken.kraken-atlas-*' -ErrorAction SilentlyContinue | ForEach-Object { $versionText = $_.Name -replace '^binarykraken\\.kraken-atlas-', ''; try { [pscustomobject]@{ Version = [version]$versionText; Path = $_.FullName } } catch {} } | Sort-Object Version -Descending | Select-Object -First 1; if ($latest) { Join-Path $latest.Path 'dist\\cli.js' }"\`) do set "KRAKEN_ATLAS_CLI=%%I"\r\nif not defined KRAKEN_ATLAS_CLI set "KRAKEN_ATLAS_CLI=%KRAKEN_ATLAS_FALLBACK%"\r\nif not exist "%KRAKEN_ATLAS_CLI%" (\r\n  echo Kraken Atlas CLI shim target was not found: "%KRAKEN_ATLAS_CLI%"\r\n  echo Run "Kraken Atlas: Install CLI For Workspace Terminals" from Ctrl+Shift+P, then open a new terminal.\r\n  exit /b 1\r\n)\r\nnode "%KRAKEN_ATLAS_CLI%" %*\r\n`,
    ps1: `$base = Join-Path $env:USERPROFILE ".vscode\\extensions"\r\n$latest = Get-ChildItem -LiteralPath $base -Directory -Filter "binarykraken.kraken-atlas-*" -ErrorAction SilentlyContinue |\r\n  ForEach-Object {\r\n    $versionText = $_.Name -replace "^binarykraken\\.kraken-atlas-", ""\r\n    try { [pscustomobject]@{ Version = [version]$versionText; Path = $_.FullName } } catch {}\r\n  } |\r\n  Sort-Object Version -Descending |\r\n  Select-Object -First 1\r\n$cli = if ($latest) { Join-Path $latest.Path "dist\\cli.js" } else { '${psEscapedFallback}' }\r\nif (!(Test-Path -LiteralPath $cli)) {\r\n  Write-Error "Kraken Atlas CLI shim target was not found: $cli. Run 'Kraken Atlas: Install CLI For Workspace Terminals' from Ctrl+Shift+P, then open a new terminal."\r\n  exit 1\r\n}\r\nnode $cli @args\r\n`,
    sh: `#!/usr/bin/env sh\nbase="$HOME/.vscode/extensions"\ncli=""\nif [ -d "$base" ]; then\n  cli="$(ls -d "$base"/binarykraken.kraken-atlas-* 2>/dev/null | sort -V | tail -n 1)/dist/cli.js"\nfi\nif [ ! -f "$cli" ]; then\n  cli='${shEscapedFallback}'\nfi\nif [ ! -f "$cli" ]; then\n  echo "Kraken Atlas CLI shim target was not found: $cli" >&2\n  echo "Run 'Kraken Atlas: Install CLI For Workspace Terminals' from Ctrl+Shift+P, then open a new terminal." >&2\n  exit 1\nfi\nnode "$cli" "$@"\n`
  };
}
