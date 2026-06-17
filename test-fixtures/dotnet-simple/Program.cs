using DotnetSimple.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.Configure<UserOptions>(builder.Configuration.GetSection("Users"));
builder.Services.AddScoped<IUserService, UserService>();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok());
app.MapControllers();

app.Run();

public class UserOptions
{
    public string DefaultName { get; set; } = "Unknown";
}
