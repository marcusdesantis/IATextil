using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Textil_backend.Models;

namespace Textil_backend.Tests.Controllers;

/// <summary>
/// Controller tests for endpoints not covered by InspectionControllerTests:
///   GET  /api/inspection/snapshot-image/{snapshotId}
///   GET  /api/inspection/snapshot/{snapshotId}/annotations
///   POST /api/inspection/snapshot/{snapshotId}/annotations
///   POST /api/inspection/capture/{cameraId}
/// </summary>
public class InspectionControllerAnnotationsTests : IClassFixture<InspectionWebAppExtendedFactory>
{
    private readonly HttpClient _client;
    private readonly InspectionWebAppExtendedFactory _factory;

    private static InspectionSnapshot FakeSnapshot(int id = 1) => new()
    {
        SnapshotId = id,
        RecordingId = 10,
        FileName = "snapshot_001.bin",
        FileRelativePath = "captures/DEV_001/snapshot_001.bin",
        CaptureTimestamp = DateTime.UtcNow,
        CameraFrameId = 12345,
        MachineState = "DefectCapture",
    };

    private static DefectAnnotation FakeAnnotation(int snapshotId = 1, int section = 3) => new()
    {
        AnnotationId = 1,
        SnapshotId = snapshotId,
        SectionIndex = section,
        DefectType = "Slub",
        CropImagePath = $"captures/DEV_001/snapshot_001_s{section}.png",
        CreatedAt = DateTime.UtcNow,
    };

    public InspectionControllerAnnotationsTests(InspectionWebAppExtendedFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        factory.Repository.ClearReceivedCalls();
        factory.Storage.ClearReceivedCalls();
        factory.ImageProcessor.ClearReceivedCalls();
        factory.CameraService.ClearReceivedCalls();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET /api/inspection/snapshot-image/{snapshotId}
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetSnapshotImage_Returns404_WhenSnapshotNotInDatabase()
    {
        _factory.Repository.GetSnapshotAsync(99).Returns((InspectionSnapshot?)null);

        var response = await _client.GetAsync("/api/inspection/snapshot-image/99");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("not found");
    }

    [Fact]
    public async Task GetSnapshotImage_Returns404_WhenImageFileNotOnDisk()
    {
        var snapshot = FakeSnapshot(5);
        _factory.Repository.GetSnapshotAsync(5).Returns(snapshot);
        // Storage returns a path that does not exist on disk
        _factory.Storage.GetAbsolutePath(Arg.Any<string>())
            .Returns(@"C:\nonexistent\path\file.bin");

        var response = await _client.GetAsync("/api/inspection/snapshot-image/5");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("not found");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET /api/inspection/snapshot/{snapshotId}/annotations
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetAnnotations_Returns200_WithEmptyList_WhenNoneExist()
    {
        _factory.Repository.GetAnnotationsBySnapshotAsync(1)
            .Returns(Array.Empty<DefectAnnotation>());

        var response = await _client.GetAsync("/api/inspection/snapshot/1/annotations");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement[]>();
        body.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAnnotations_Returns200_WithAnnotationList()
    {
        var annotations = new[]
        {
            FakeAnnotation(snapshotId: 2, section: 1),
            FakeAnnotation(snapshotId: 2, section: 4),
        };
        _factory.Repository.GetAnnotationsBySnapshotAsync(2).Returns(annotations);

        var response = await _client.GetAsync("/api/inspection/snapshot/2/annotations");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement[]>();
        body.Should().HaveCount(2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST /api/inspection/snapshot/{snapshotId}/annotations
    // ══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    [InlineData(-1)]
    public async Task CreateAnnotation_Returns400_ForInvalidSectionIndex(int badSection)
    {
        var body = JsonContent.Create(new { SectionIndex = badSection, DefectType = "Slub" });

        var response = await _client.PostAsync("/api/inspection/snapshot/1/annotations", body);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("SectionIndex");
    }

    [Fact]
    public async Task CreateAnnotation_Returns404_WhenSnapshotNotFound()
    {
        _factory.Repository.GetSnapshotAsync(999).Returns((InspectionSnapshot?)null);
        var body = JsonContent.Create(new { SectionIndex = 3, DefectType = "Knot" });

        var response = await _client.PostAsync("/api/inspection/snapshot/999/annotations", body);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task CreateAnnotation_Returns200_WhenAnnotationAlreadyExists_IsIdempotent()
    {
        var snapshot = FakeSnapshot(10);
        var existing = FakeAnnotation(snapshotId: 10, section: 3);

        _factory.Repository.GetSnapshotAsync(10).Returns(snapshot);
        _factory.Repository.GetAnnotationsBySnapshotAsync(10)
            .Returns(new[] { existing });

        var body = JsonContent.Create(new { SectionIndex = 3, DefectType = "Slub" });

        var response = await _client.PostAsync("/api/inspection/snapshot/10/annotations", body);

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "creating an annotation for an already-annotated section must be idempotent");
        await _factory.Repository.DidNotReceive().SaveAnnotationAsync(Arg.Any<DefectAnnotation>());
    }

    [Fact]
    public async Task CreateAnnotation_Returns404_WhenPngNotOnDisk()
    {
        var snapshot = FakeSnapshot(20);
        _factory.Repository.GetSnapshotAsync(20).Returns(snapshot);
        _factory.Repository.GetAnnotationsBySnapshotAsync(20)
            .Returns(Array.Empty<DefectAnnotation>());
        _factory.Storage.GetAbsolutePath(Arg.Any<string>())
            .Returns(@"C:\nonexistent\path\file.bin");

        var body = JsonContent.Create(new { SectionIndex = 2, DefectType = "Holes" });

        var response = await _client.PostAsync("/api/inspection/snapshot/20/annotations", body);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("PNG");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST /api/inspection/capture/{cameraId}
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Capture_Returns200_WithSnapshot()
    {
        var snapshot = FakeSnapshot();
        _factory.CameraService
            .CaptureSnapshotAsync("DEV_001", Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(snapshot);

        var response = await _client.PostAsync("/api/inspection/capture/DEV_001", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("snapshotId").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Capture_Returns400_WhenServiceThrows()
    {
        _factory.CameraService
            .CaptureSnapshotAsync(Arg.Any<string>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("No active session for camera."));

        var response = await _client.PostAsync("/api/inspection/capture/DEV_999", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("No active session");
    }
}
