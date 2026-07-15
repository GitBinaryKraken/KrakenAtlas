using FeatureFlow.Connector;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllersWithViews();
builder.Services.AddScoped<IPersonaConnector>(_ =>
    new PersonaConnector(new HttpClient { BaseAddress = new Uri("https://api.example.test") }));

var app = builder.Build();
app.MapDefaultControllerRoute();
app.Run();
