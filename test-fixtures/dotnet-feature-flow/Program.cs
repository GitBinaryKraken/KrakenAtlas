using DotnetFeatureFlow.Background;
using DotnetFeatureFlow.Data;
using DotnetFeatureFlow.Middleware;
using DotnetFeatureFlow.Options;
using DotnetFeatureFlow.Repositories;
using DotnetFeatureFlow.Services;
using DotnetFeatureFlow.Validation;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.Configure<UserPreferenceOptions>(builder.Configuration.GetSection("UserPreferences"));
builder.Services.AddScoped<IUserPreferencesRepository, UserPreferencesRepository>();
builder.Services.AddScoped<IUserPreferencesService, UserPreferencesService>();
builder.Services.AddScoped<IValidator<UserPreferenceRequest>, UserPreferenceRequestValidator>();
builder.Services.AddHostedService<PreferenceDigestWorker>();
builder.Services.AddControllersWithViews();

var app = builder.Build();

app.UseMiddleware<PreferenceAuditMiddleware>();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => "ok");
app.Run();
