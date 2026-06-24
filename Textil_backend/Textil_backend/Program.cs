
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
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

            // Authentication / authorization
            builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
            builder.Services.AddSingleton<TokenService>();

            var jwtKey = builder.Configuration["Jwt:Key"]
                ?? throw new InvalidOperationException("Jwt:Key is not configured.");

            builder.Services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidIssuer = builder.Configuration["Jwt:Issuer"],
                        ValidateAudience = true,
                        ValidAudience = builder.Configuration["Jwt:Audience"],
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                        ValidateLifetime = true,
                        ClockSkew = TimeSpan.Zero,
                    };
                });

            builder.Services.AddAuthorization();

            builder.Services.AddOpenApi();

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowFrontend", policy =>
                {
                    policy
                        .AllowAnyOrigin()
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

                        ALTER TABLE recordingsessions
                            ADD COLUMN IF NOT EXISTS startedbyuserid   INTEGER,
                            ADD COLUMN IF NOT EXISTS startedbyusername VARCHAR(100);

                        CREATE TABLE IF NOT EXISTS users (
                            userid       SERIAL PRIMARY KEY,
                            username     VARCHAR(100) NOT NULL,
                            passwordhash VARCHAR(255) NOT NULL,
                            role         VARCHAR(50)  NOT NULL,
                            displayname  VARCHAR(150),
                            isactive     BOOLEAN NOT NULL DEFAULT TRUE,
                            createdat    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                        );

                        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username
                            ON users(username);
                    ");
                }
                catch (Exception ex)
                {
                    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
                    log.LogWarning(ex, "Column migration skipped — provider may not support raw SQL");
                }

                // Seed the default users (admin + operator). Each is created only if its
                // username is missing. Set SeedUsers:ResetExisting=true to also reset the
                // password/role of an already-existing seed user (handy to recover access).
                try
                {
                    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();
                    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
                    var resetExisting = app.Configuration.GetValue<bool>("SeedUsers:ResetExisting");

                    SeedUser(db, hasher, log, app.Configuration, "SeedUsers:Admin", "admin", UserRoles.Administrator, resetExisting);
                    SeedUser(db, hasher, log, app.Configuration, "SeedUsers:Operator", "operator", UserRoles.Operator, resetExisting);

                    db.SaveChanges();
                }
                catch (Exception ex)
                {
                    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
                    log.LogWarning(ex, "User seeding skipped");
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

            app.UseAuthentication();
            app.UseAuthorization();


            app.MapControllers();

            app.Run();
        }

        /// <summary>
        /// Ensures a seed user exists. Creates it if its username is missing. If
        /// <paramref name="resetExisting"/> is true, also resets an existing user's
        /// password/role/active state to the configured values (access recovery).
        /// Does nothing if no password is configured for the section.
        /// </summary>
        private static void SeedUser(
            AppDbContext db,
            IPasswordHasher<User> hasher,
            ILogger logger,
            IConfiguration config,
            string section,
            string defaultUsername,
            string role,
            bool resetExisting)
        {
            var username = config[$"{section}:Username"] ?? defaultUsername;
            var password = config[$"{section}:Password"];
            if (string.IsNullOrWhiteSpace(password))
                return; // no password configured → nothing to seed

            var displayName = config[$"{section}:DisplayName"];
            var existing = db.Users.FirstOrDefault(u => u.Username == username);

            if (existing is null)
            {
                var user = new User
                {
                    Username = username,
                    Role = role,
                    DisplayName = displayName,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                };
                user.PasswordHash = hasher.HashPassword(user, password);
                db.Users.Add(user);
                logger.LogInformation("Seeded user '{Username}' ({Role}).", username, role);
            }
            else if (resetExisting)
            {
                existing.PasswordHash = hasher.HashPassword(existing, password);
                existing.Role = role;
                existing.IsActive = true;
                if (!string.IsNullOrWhiteSpace(displayName))
                    existing.DisplayName = displayName;
                logger.LogWarning("Reset existing user '{Username}' to configured seed values.", username);
            }
        }
    }
}
