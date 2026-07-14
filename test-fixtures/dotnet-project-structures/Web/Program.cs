using Atlas.Structures.Contracts;
using Atlas.Structures.Web;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddTransient<ClockEndpoint>();

var app = builder.Build();
app.MapGet("/clock", (ClockEndpoint endpoint) => endpoint.Handle());
app.Run();
