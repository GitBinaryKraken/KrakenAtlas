var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHostedService<CacheRefreshWorker>();
var app = builder.Build();
app.MapGet("/", () => "ready");
app.Run();

sealed class CacheRefreshWorker : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.CompletedTask;
}
