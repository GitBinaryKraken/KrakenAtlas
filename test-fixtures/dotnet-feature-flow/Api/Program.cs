using FeatureFlow.DataAccess;
using FeatureFlow.Logic;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddScoped<IPersonaService, PersonaService>();
builder.Services.AddScoped<IPersonaData>(_ => new PersonaData("Host=localhost;Database=feature_flow"));

var app = builder.Build();
app.MapControllers();
app.Run();
