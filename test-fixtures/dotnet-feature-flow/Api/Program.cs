using FeatureFlow.DataAccess;
using FeatureFlow.Logic;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();
builder.Services.AddDbContext<PersonaDbContext>();
builder.Services.AddScoped<PersonaEfStore>();
builder.Services.AddScoped<IPersonaService, PersonaService>();
builder.Services.AddScoped<IPersonaData>(_ => new PersonaData("Host=localhost;Database=feature_flow"));

var app = builder.Build();
app.UseExceptionHandler("/error");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet(
        "/minimal/personas/{sid}",
        async ([FromRoute] string sid, [FromServices] PersonaEfStore store, CancellationToken cancellationToken) =>
            await store.FindAsync(sid, cancellationToken))
    .Produces<PersonaRecord>(StatusCodes.Status200OK)
    .RequireAuthorization("Persona.Read");
app.MapPost(
        "/minimal/personas",
        async ([FromBody] PersonaRecord persona, [FromServices] PersonaEfStore store, CancellationToken cancellationToken) =>
        {
            await store.AddAsync(persona, cancellationToken);
            return persona;
        })
    .Accepts<PersonaRecord>("application/json")
    .Produces<PersonaRecord>(StatusCodes.Status201Created)
    .RequireAuthorization("Persona.Write");
var diagnostics = app.MapGroup("/v2/diagnostics");
diagnostics.MapGet("/health", () => Results.Ok(new { status = "healthy" }));
app.Run();
