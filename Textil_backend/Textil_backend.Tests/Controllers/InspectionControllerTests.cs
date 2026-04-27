using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Textil_backend.Interfaces;
using Textil_backend.Models;

namespace Textil_backend.Tests.Controllers;

/// <summary>
/// Integration tests for InspectionController.
/// The real ASP.NET Core pipeline runs in memory; only IVimbaCameraService is mocked.
/// </summary>
public class InspectionControllerTests : IClassFixture<InspectionWebAppFactory>
{
    private readonly HttpClient _client;
    private readonly IVimbaCameraService _camera;

    // ── Shared test data ──────────────────────────────────────────────────────
    private static readonly CameraInfoDto[] FakeCameras =
    [
        new() { Id = "DEV_001", Name = "Demo Cam 1", Serial = "SN001", ModelName = "Demo", InterfaceName = "USB3" },
        new() { Id = "DEV_002", Name = "Demo Cam 2", Serial = "SN002", ModelName = "Demo", InterfaceName = "USB3" },
    ];

    private static InspectionSnapshot FakeSnapshot(string cameraId = "DEV_001") => new()
    {
        SnapshotId = 1,
        RecordingId = 10,
        FileName = "snapshot_001.bin",
        FileRelativePath = $"captures/{cameraId}/snapshot_001.bin",
        CaptureTimestamp = DateTime.UtcNow,
        CameraFrameId = 12345,
        MachineState = "DefectCapture",
        DefectType = "Slub",
        RulerPosition = 3,
        CalculatedOffsetFrames = 156,
    };

    public InspectionControllerTests(InspectionWebAppFactory factory)
    {
        _client = factory.CreateClient();
        _camera = factory.CameraService;
        _camera.ClearReceivedCalls();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET /api/inspection/cameras
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetCameras_Returns200_WithCameraList()
    {
        _camera.GetCameras().Returns(FakeCameras);

        var response = await _client.GetAsync("/api/inspection/cameras");
        var body = await response.Content.ReadFromJsonAsync<CameraInfoDto[]>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body.Should().HaveCount(2);
        body![0].Id.Should().Be("DEV_001");
    }

    [Fact]
    public async Task GetCameras_Returns200_WithEmptyList_WhenNoCamerasFound()
    {
        _camera.GetCameras().Returns([]);

        var response = await _client.GetAsync("/api/inspection/cameras");
        var body = await response.Content.ReadFromJsonAsync<CameraInfoDto[]>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body.Should().BeEmpty();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET /api/inspection/active-sessions
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetActiveSessions_Returns200_WithSessionList()
    {
        _camera.GetActiveSessions().Returns([
            new { cameraId = "DEV_001", isRecording = true, fabricIsMoving = true }
        ]);

        var response = await _client.GetAsync("/api/inspection/active-sessions");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET /api/inspection/ruler-config
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task GetRulerConfig_Returns200_WithTwelvePositions()
    {
        var response = await _client.GetAsync("/api/inspection/ruler-config");
        var body = await response.Content.ReadFromJsonAsync<RulerConfigResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.DefectTypes.Should().Contain(["Slub", "Floats", "Knot", "Holes", "Ladder"]);
        body!.PositionCount.Should().Be(12);
        body.Positions.Should().HaveCount(12);
    }

    [Fact]
    public async Task GetRulerConfig_Position1_Has52Point5CmDistance()
    {
        var response = await _client.GetAsync("/api/inspection/ruler-config");
        var body = await response.Content.ReadFromJsonAsync<RulerConfigResponse>();

        var pos1 = body!.Positions.Single(p => p.Position == 1);
        pos1.DistanceCm.Should().BeApproximately(52.5, precision: 0.01,
            because: "position 1 center = 50 + 0.5 × 5 = 52.5 cm from camera");
    }

    [Fact]
    public async Task GetRulerConfig_Position12_Has107Point5CmDistance()
    {
        var response = await _client.GetAsync("/api/inspection/ruler-config");
        var body = await response.Content.ReadFromJsonAsync<RulerConfigResponse>();

        var pos12 = body!.Positions.Single(p => p.Position == 12);
        pos12.DistanceCm.Should().BeApproximately(107.5, precision: 0.01,
            because: "position 12 center = 50 + 11.5 × 5 = 107.5 cm from camera");
    }

    [Fact]
    public async Task GetRulerConfig_FramesBack_IncreaseMonotonically()
    {
        var response = await _client.GetAsync("/api/inspection/ruler-config");
        var body = await response.Content.ReadFromJsonAsync<RulerConfigResponse>();

        var frames = body!.Positions.OrderBy(p => p.Position).Select(p => p.FramesBack).ToList();
        frames.Should().BeInAscendingOrder(
            because: "each higher ruler position is farther from the camera");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST /api/inspection/start-recording/{cameraId}
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task StartRecording_Returns200_WithFolder()
    {
        _camera.StartRecordingAsync("DEV_001", Arg.Any<string?>(), Arg.Any<int?>(), Arg.Any<CancellationToken>())
               .Returns("/captures/DEV_001/20260422");

        var response = await _client.PostAsync(
            "/api/inspection/start-recording/DEV_001?machineState=Production&ringBufferSize=300",
            null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<StartRecordingResponse>();
        body!.Folder.Should().Contain("DEV_001");
    }

    [Fact]
    public async Task StartRecording_Returns400_WhenCameraAlreadyRecording()
    {
        _camera.StartRecordingAsync(Arg.Any<string>(), Arg.Any<string?>(), Arg.Any<int?>(), Arg.Any<CancellationToken>())
               .ThrowsAsync(new InvalidOperationException("Camera DEV_001 is already recording."));

        var response = await _client.PostAsync("/api/inspection/start-recording/DEV_001", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST /api/inspection/stop-recording/{cameraId}
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task StopRecording_Returns200()
    {
        _camera.StopRecordingAsync("DEV_001").Returns(Task.CompletedTask);

        var response = await _client.PostAsync("/api/inspection/stop-recording/DEV_001", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _camera.Received(1).StopRecordingAsync("DEV_001");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST /api/inspection/fabric-state/{cameraId}
    // ══════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData(true,  "Fabric moving")]
    [InlineData(false, "Fabric stopped")]
    public async Task SetFabricState_Returns200_WithCorrectMessage(bool isMoving, string expectedMessage)
    {
        var response = await _client.PostAsync(
            $"/api/inspection/fabric-state/DEV_001?isMoving={isMoving}", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain(expectedMessage);
        _camera.Received(1).SetFabricState("DEV_001", isMoving);
    }

    [Fact]
    public async Task SetFabricState_Returns400_WhenNoSessionExists()
    {
        _camera.When(x => x.SetFabricState(Arg.Any<string>(), Arg.Any<bool>()))
               .Do(_ => throw new InvalidOperationException("No active recording session."));

        var response = await _client.PostAsync(
            "/api/inspection/fabric-state/DEV_001?isMoving=false", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST /api/inspection/capture-defect/{cameraId}
    // ══════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task CaptureDefect_Returns200_WithSnapshot()
    {
        var snapshot = FakeSnapshot();
        _camera.CaptureDefectAsync(
            "DEV_001",
            Arg.Any<int?>(), Arg.Any<int?>(), Arg.Any<string?>(),
            Arg.Any<string?>(), Arg.Any<int?>(),
            Arg.Any<CancellationToken>()
        ).Returns(snapshot);

        var response = await _client.PostAsync(
            "/api/inspection/capture-defect/DEV_001?rulerPosition=3", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<InspectionSnapshot>();
        body!.RulerPosition.Should().Be(3);
    }

    [Fact]
    public async Task CaptureDefect_Returns400_WhenFabricIsMoving()
    {
        _camera.CaptureDefectAsync(
            Arg.Any<string>(),
            Arg.Any<int?>(), Arg.Any<int?>(), Arg.Any<string?>(),
            Arg.Any<string?>(), Arg.Any<int?>(),
            Arg.Any<CancellationToken>()
        ).ThrowsAsync(new InvalidOperationException("Fabric must be stopped before capturing a defect."));

        var response = await _client.PostAsync(
            "/api/inspection/capture-defect/DEV_001?rulerPosition=5", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("Fabric must be stopped");
    }

    [Fact]
    public async Task CaptureDefect_Returns400_WhenBufferIsEmpty()
    {
        _camera.CaptureDefectAsync(
            Arg.Any<string>(),
            Arg.Any<int?>(), Arg.Any<int?>(), Arg.Any<string?>(),
            Arg.Any<string?>(), Arg.Any<int?>(),
            Arg.Any<CancellationToken>()
        ).ThrowsAsync(new InvalidOperationException("Ring buffer is empty."));

        var response = await _client.PostAsync(
            "/api/inspection/capture-defect/DEV_001?rulerPosition=1", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Ruler position validation ─────────────────────────────────────────────

    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    [InlineData(-1)]
    public async Task CaptureDefect_Returns400_ForInvalidRulerPosition(int badPosition)
    {
        var response = await _client.PostAsync(
            $"/api/inspection/capture-defect/DEV_001?defectType=Slub&rulerPosition={badPosition}", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var json = await response.Content.ReadAsStringAsync();
        json.Should().Contain("Invalid ruler position",
            because: "positions outside 1–12 must be rejected before hitting the service");

        // Service must NOT be called for out-of-range positions
        await _camera.DidNotReceive().CaptureDefectAsync(
            Arg.Any<string>(),
            Arg.Any<int?>(), Arg.Any<int?>(), Arg.Any<string?>(),
            Arg.Any<string?>(), Arg.Any<int?>(),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(6)]
    [InlineData(12)]
    public async Task CaptureDefect_AcceptsValidRulerPositions(int validPosition)
    {
        _camera.CaptureDefectAsync(
            Arg.Any<string>(),
            Arg.Any<int?>(), Arg.Any<int?>(), Arg.Any<string?>(),
            Arg.Any<string?>(), Arg.Any<int?>(),
            Arg.Any<CancellationToken>()
        ).Returns(FakeSnapshot());

        var response = await _client.PostAsync(
            $"/api/inspection/capture-defect/DEV_001?rulerPosition={validPosition}", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Helper DTOs for deserialization ──────────────────────────────────────

    private record StartRecordingResponse(string Message, string CameraId, string Folder);

    private record RulerConfigResponse(
        List<string> DefectTypes,
        int PositionCount,
        double BaseDistanceCm,
        double PositionSpacingCm,
        double CmPerFrame,
        List<RulerPositionDto> Positions);

    private record RulerPositionDto(int Position, double DistanceCm, int FramesBack);
}
