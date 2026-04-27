using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Textil_backend.Interfaces;

namespace Textil_backend.Tests;

/// <summary>
/// Extends the basic factory by also replacing IInspectionRepository,
/// IStorageService, and IImageProcessingService with NSubstitute mocks.
/// Used for controller tests that exercise the annotation and snapshot-image endpoints.
/// </summary>
public class InspectionWebAppExtendedFactory : WebApplicationFactory<Program>
{
    public IVimbaCameraService CameraService { get; } = Substitute.For<IVimbaCameraService>();
    public IInspectionRepository Repository { get; } = Substitute.For<IInspectionRepository>();
    public IStorageService Storage { get; } = Substitute.For<IStorageService>();
    public IImageProcessingService ImageProcessor { get; } = Substitute.For<IImageProcessingService>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            Replace<IVimbaCameraService>(services, CameraService);
            Replace<IInspectionRepository>(services, Repository);
            Replace<IStorageService>(services, Storage);
            Replace<IImageProcessingService>(services, ImageProcessor);
        });
    }

    private static void Replace<TService>(IServiceCollection services, TService mock) where TService : class
    {
        var existing = services.SingleOrDefault(d => d.ServiceType == typeof(TService));
        if (existing is not null) services.Remove(existing);
        services.AddSingleton(mock);
    }
}
