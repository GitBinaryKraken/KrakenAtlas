using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace FeatureFlow.DataAccess;

[Table("persona_records", Schema = "app")]
[Index(nameof(Sid), IsUnique = true, Name = "UX_persona_records_sid")]
public sealed class PersonaRecord
{
    [Key]
    public int Id { get; set; }

    [Column("sid")]
    public required string Sid { get; set; }

    [Column("display_name")]
    public required string DisplayName { get; set; }

    public DateTimeOffset? LastSeenUtc { get; set; }
}

public sealed class PersonaDbContext(DbContextOptions<PersonaDbContext> options) : DbContext(options)
{
    public DbSet<PersonaRecord> Personas => Set<PersonaRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("app");
        modelBuilder.Entity<PersonaRecord>(entity =>
        {
            entity.ToTable("persona_records", "app");
            entity.HasKey(persona => persona.Id);
            entity.Property(persona => persona.DisplayName).HasColumnName("display_name");
            entity.HasIndex(persona => persona.Sid).IsUnique();
        });
    }
}

public sealed class PersonaEfStore(PersonaDbContext context)
{
    public Task<PersonaRecord?> FindAsync(string sid, CancellationToken cancellationToken) =>
        context.Personas
            .AsNoTracking()
            .FirstOrDefaultAsync(persona => persona.Sid == sid, cancellationToken);

    public async Task AddAsync(PersonaRecord persona, CancellationToken cancellationToken)
    {
        await context.Personas.AddAsync(persona, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
    }
}
