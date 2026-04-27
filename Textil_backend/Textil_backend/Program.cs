
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;
using Textil_backend.Interfaces;
using Textil_backend.Models;
using Textil_backend.Repositories;
using Textil_backend.Services;

namespace Textil_backend
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.

            builder.Services.AddControllers();
            builder.Services.Configure<FabricSettings>(
                builder.Configuration.GetSection("FabricSimulation"));
            builder.Services.AddDbContext<AppDbContext>(options =>
                options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

            builder.Services.AddSingleton<IImageProcessingService, ImageProcessingService>();

            builder.Services.AddSingleton<IStorageService, StorageService>();

            builder.Services.AddSingleton<IInspectionRepository, InspectionRepository>();

            // Camera Logic
            builder.Services.AddSingleton<IVimbaCameraService, VimbaCameraService>();



            builder.Services.AddOpenApi();

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowFrontend", policy =>
                {
                    policy
                        .WithOrigins("http://localhost:4200")
                        .AllowAnyHeader()
                        .AllowAnyMethod();
                });
            });

            var app = builder.Build();

            // Skip DB initialization when running integration tests (no real DB available).
            if (!app.Environment.EnvironmentName.Equals("Testing", StringComparison.OrdinalIgnoreCase))
            {
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.Database.EnsureCreated();

                // Add new columns introduced after initial schema creation.
                // ADD COLUMN IF NOT EXISTS is idempotent — safe on every startup.
                try
                {
                    db.Database.ExecuteSqlRaw(@"
                        ALTER TABLE inspectionsnapshots
                            ADD COLUMN IF NOT EXISTS defecttype            VARCHAR(100),
                            ADD COLUMN IF NOT EXISTS rulerposition         INTEGER,
                            ADD COLUMN IF NOT EXISTS calculatedoffsetframes INTEGER;

                        CREATE TABLE IF NOT EXISTS defectannotations (
                            annotationid  SERIAL PRIMARY KEY,
                            snapshotid    INT    NOT NULL REFERENCES inspectionsnapshots(snapshotid) ON DELETE CASCADE,
                            sectionindex  INT    NOT NULL,
                            defecttype    VARCHAR(100),
                            cropimagepath VARCHAR(500),
                            createdat     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                        );

                        ALTER TABLE defectannotations
                            ADD COLUMN IF NOT EXISTS defecttype VARCHAR(100);

                        CREATE INDEX IF NOT EXISTS ix_defectannotations_snapshotid
                            ON defectannotations(snapshotid);
                    ");
                }
                catch (Exception ex)
                {
                    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
                    log.LogWarning(ex, "Column migration skipped — provider may not support raw SQL");
                }
            }

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
                app.MapScalarApiReference();
            }

            app.UseHttpsRedirection();

            app.UseCors("AllowFrontend");

            app.UseAuthorization();


            app.MapControllers();

            app.Run();
        }
    }
}
