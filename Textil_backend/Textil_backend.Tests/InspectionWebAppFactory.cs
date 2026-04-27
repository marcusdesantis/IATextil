using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Textil_backend.Interfaces;

namespace Textil_backend.Tests;

/// <summary>
/// Spins up the real ASP.NET Core pipeline in memory.
///
/// Environment is set to "Testing" so Program.cs skips the PostgreSQL
/// EnsureCreated / ALTER TABLE startup block — no real DB needed.
///
/// IVimbaCameraService is replaced with an NSubstitute mock so tests
/// run without physical cameras or the Vimba SDK hardware.
/// </summary>
public class InspectionWebAppFactory : WebApplicationFactory<Program>
{
    /// <summary>Pre-configured mock available to all tests in the fixture.</summary>
    public IVimbaCameraService CameraService { get; } = Substitute.For<IVimbaCameraService>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // "Testing" environment → DB init block in Program.cs is skipped
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // Replace real VimbaCameraService (requires physical camera + Vimba SDK)
            var existing = services.SingleOrDefault(d => d.ServiceType == typeof(IVimbaCameraService));
            if (existing is not null) services.Remove(existing);
            services.AddSingleton(CameraService);
        });
    }
}
