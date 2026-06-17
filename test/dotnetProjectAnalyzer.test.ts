import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import { analyzeDotnetProjects } from "../src/analyzers/dotnetProjectAnalyzer";
import { scanWorkspaceFiles } from "../src/scanner/fileScanner";

test("analyzeDotnetProjects emits project symbols and ProjectReference relationships", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kraken-atlas-projectrefs-"));
  await fs.mkdir(path.join(root, "Web"), { recursive: true });
  await fs.mkdir(path.join(root, "Domain"), { recursive: true });
  await fs.writeFile(
    path.join(root, "Web", "Web.csproj"),
    `<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <ProjectReference Include="..\\Domain\\Domain.csproj" />
  </ItemGroup>
</Project>`,
    "utf8"
  );
  await fs.writeFile(path.join(root, "Domain", "Domain.csproj"), `<Project Sdk="Microsoft.NET.Sdk" />`, "utf8");

  const files = await scanWorkspaceFiles(root, { outputFolder: ".kraken-atlas" });
  const result = await analyzeDotnetProjects(root, files);

  assert.ok(result.symbols.some((symbol) => symbol.id === "symbol:dotnet-project:Web/Web.csproj"));
  assert.ok(result.symbols.some((symbol) => symbol.id === "symbol:dotnet-project:Domain/Domain.csproj"));
  assert.ok(
    result.relationships.some(
      (relationship) =>
        relationship.type === "PROJECT_REFERENCES" &&
        relationship.from === "symbol:dotnet-project:Web/Web.csproj" &&
        relationship.to === "symbol:dotnet-project:Domain/Domain.csproj"
    )
  );
});
