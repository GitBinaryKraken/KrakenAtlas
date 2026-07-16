using Microsoft.EntityFrameworkCore.Migrations;

namespace FeatureFlow.DataAccess.Migrations;

public sealed class CreatePersonaRecords : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "persona_records",
            schema: "app",
            columns: table => new
            {
                Id = table.Column<int>(nullable: false),
                sid = table.Column<string>(nullable: false),
                display_name = table.Column<string>(nullable: false),
                LastSeenUtc = table.Column<DateTimeOffset>(nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_persona_records", row => row.Id));
        migrationBuilder.CreateIndex(
            name: "UX_persona_records_sid",
            schema: "app",
            table: "persona_records",
            column: "sid",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "persona_records", schema: "app");
    }
}
