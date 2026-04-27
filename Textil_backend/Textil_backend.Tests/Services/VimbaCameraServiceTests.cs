using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Textil_backend.Interfaces;
using Textil_backend.Models;
using Textil_backend.Services;
using VmbNET;

namespace Textil_backend.Tests.Services;

/// <summary>
/// Unit tests for VimbaCameraService using a simulated IVmbSystem (NSubstitute).
/// The static _sessions dictionary is accessed via reflection so each test can
/// inject or clean up sessions without touching the real hardware stack.
/// </summary>
public class VimbaCameraServiceTests
{
    private readonly IVmbSystem _vmbSystem = Substitute.For<IVmbSystem>();
    private readonly IImageProcessingService _imageProcessor = Substitute.For<IImageProcessingService>();
    private readonly IStorageService _storage = Substitute.For<IStorageService>();
    private readonly IInspectionRepository _repository = Substitute.For<IInspectionRepository>();
    private readonly ILogger<VimbaCameraService> _logger = Substitute.For<ILogger<VimbaCameraService>>();
    private readonly IOptionsMonitor<FabricSettings> _options = Substitute.For<IOptionsMonitor<FabricSettings>>();

    private readonly FabricSettings _settings = new()
    {
        RingBufferSize = 100,
        DefaultOffsetFrames = 5,
        DefaultFrameCount = 3,
        CmPerFrame = 0.4,
        RulerBaseDistanceCm = 50.0,
        RulerPositionSpacingCm = 5.0,
        RulerPositionCount = 12,
    };

    public VimbaCameraServiceTests()
    {
        _options.CurrentValue.Returns(_settings);
    }

    private VimbaCameraService BuildSut() =>
        new(_imageProcessor, _storage, _repository, _logger, _options, _vmbSystem);

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static ICamera MakeCamera(string id, string name = "Test Cam", string model = "Model X")
    {
        var cam = Substitute.For<ICamera>();
        cam.Id.Returns(id);
        cam.Serial.Returns("SN001");
        cam.Name.Returns(name);
        cam.ModelName.Returns(model);
        cam.Interface.Returns((IInterface?)null);
        return cam;
    }

    private static FrameEntry MakeFrame(long id) => new()
    {
        FrameId = id,
        Bytes = new byte[4],
        Width = 2,
        Height = 2,
        PixelFormat = IFrame.PixelFormatValue.Mono8,
        TimestampUtc = DateTime.UtcNow,
    };

    private static ConcurrentDictionary<string, ActiveRecordingSession> Sessions()
    {
        var field = typeof(VimbaCameraService)
            .GetField("_sessions", BindingFlags.Static | BindingFlags.NonPublic)!;
        return (ConcurrentDictionary<string, ActiveRecordingSession>)field.GetValue(null)!;
    }

    private static void InjectSession(string cameraId, ActiveRecordingSession session) =>
        Sessions()[cameraId] = session;

    private static void RemoveSession(string cameraId) =>
        Sessions().TryRemove(cameraId, out _);

    private ActiveRecordingSession BuildStoppedSession(string cameraId, int frameCount = 0, int ringBufferSize = 500)
    {
        var openCam = Substitute.For<IOpenCamera>();
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());

        var session = new ActiveRecordingSession
        {
            CameraId = cameraId,
            OpenCamera = openCam,
            RecordingId = 1,
            IsRecording = true,
            RingBufferSize = ringBufferSize,
        };

        for (var i = 0; i < frameCount; i++)
            session.AddFrame(MakeFrame(i));

        session.SetFabricState(false);
        return session;
    }

    private void SetupCaptureStorageMocks(string cameraId)
    {
        var tempDir = Path.GetTempPath();
        _storage.GetSnapshotFolder(cameraId).Returns(tempDir);
        _storage.GenerateFileName(Arg.Any<string>(), Arg.Any<long>())
            .Returns($"snap_{Guid.NewGuid():N}.bin");
        _storage.GetRelativePath(Arg.Any<string>()).Returns("snapshots/snap.bin");
        _imageProcessor.StitchFrames(
                Arg.Any<FrameEntry[]>(), Arg.Any<uint>(), Arg.Any<uint>(), Arg.Any<IFrame.PixelFormatValue>())
            .Returns(new byte[8]);
        _imageProcessor.TryWritePngAsync(
                Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<uint>(), Arg.Any<uint>(),
                Arg.Any<IFrame.PixelFormatValue>(), Arg.Any<CancellationToken>())
            .Returns(Task.CompletedTask);
        _repository.SaveSnapshotAsync(Arg.Any<InspectionSnapshot>()).Returns(Task.CompletedTask);
    }

    // ── GetCameras ────────────────────────────────────────────────────────────

    [Fact]
    public void GetCameras_ReturnsMappedDtos()
    {
        var cam = MakeCamera("CAM_01", name: "Line Scanner", model: "Demo Model");
        _vmbSystem.GetCameras().Returns([cam]);

        var result = BuildSut().GetCameras();

        result.Should().HaveCount(1);
        result[0].Id.Should().Be("CAM_01");
        result[0].Name.Should().Be("Line Scanner");
        result[0].ModelName.Should().Be("Demo Model");
        result[0].Serial.Should().Be("SN001");
    }

    [Fact]
    public void GetCameras_ReturnsEmpty_WhenNoCameras()
    {
        _vmbSystem.GetCameras().Returns([]);

        BuildSut().GetCameras().Should().BeEmpty();
    }

    [Fact]
    public void GetCameras_SetsInterfaceName_ToNull_WhenInterfaceIsNull()
    {
        var cam = MakeCamera("CAM_02");
        cam.Interface.Returns((IInterface?)null);
        _vmbSystem.GetCameras().Returns([cam]);

        var result = BuildSut().GetCameras();

        result[0].InterfaceName.Should().BeNull();
    }

    // ── StartRecordingAsync ───────────────────────────────────────────────────

    [Fact]
    public async Task StartRecordingAsync_ReturnsFolder()
    {
        const string cameraId = "CAM_SR_01";
        var cam = MakeCamera(cameraId);
        var openCam = Substitute.For<IOpenCamera>();

        _vmbSystem.GetCameraByID(cameraId).Returns(cam);
        cam.Open().Returns(openCam);
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        _storage.GetCaptureFolder(Arg.Any<string>(), Arg.Any<DateTime>()).Returns("/captures/CAM_SR_01");
        _repository.CreateRecordingSessionAsync(Arg.Any<RecordingSessionRecord>()).Returns(1);

        try
        {
            var folder = await BuildSut().StartRecordingAsync(cameraId);
            folder.Should().Be("/captures/CAM_SR_01");
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task StartRecordingAsync_CreatesRecordingSession_InRepository()
    {
        const string cameraId = "CAM_SR_02";
        var cam = MakeCamera(cameraId);
        var openCam = Substitute.For<IOpenCamera>();

        _vmbSystem.GetCameraByID(cameraId).Returns(cam);
        cam.Open().Returns(openCam);
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        _storage.GetCaptureFolder(Arg.Any<string>(), Arg.Any<DateTime>()).Returns("/captures");
        _repository.CreateRecordingSessionAsync(Arg.Any<RecordingSessionRecord>()).Returns(42);

        try
        {
            await BuildSut().StartRecordingAsync(cameraId, machineState: "Loom1");

            await _repository.Received(1).CreateRecordingSessionAsync(
                Arg.Is<RecordingSessionRecord>(r =>
                    r.SessionName.Contains("Loom1") &&
                    r.Status == "Active"));
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task StartRecordingAsync_AddsSession_ToActiveSessions()
    {
        const string cameraId = "CAM_SR_03";
        var cam = MakeCamera(cameraId);
        var openCam = Substitute.For<IOpenCamera>();

        _vmbSystem.GetCameraByID(cameraId).Returns(cam);
        cam.Open().Returns(openCam);
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        _storage.GetCaptureFolder(Arg.Any<string>(), Arg.Any<DateTime>()).Returns("/captures");
        _repository.CreateRecordingSessionAsync(Arg.Any<RecordingSessionRecord>()).Returns(1);

        var sut = BuildSut();
        try
        {
            await sut.StartRecordingAsync(cameraId);

            var json = JsonSerializer.Serialize(sut.GetActiveSessions());
            json.Should().Contain(cameraId);
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task StartRecordingAsync_Throws_WhenCameraAlreadyRecording()
    {
        const string cameraId = "CAM_SR_DUP";
        var cam = MakeCamera(cameraId);
        var openCam = Substitute.For<IOpenCamera>();

        _vmbSystem.GetCameraByID(cameraId).Returns(cam);
        cam.Open().Returns(openCam);
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        _storage.GetCaptureFolder(Arg.Any<string>(), Arg.Any<DateTime>()).Returns("/captures");
        _repository.CreateRecordingSessionAsync(Arg.Any<RecordingSessionRecord>()).Returns(1);

        var sut = BuildSut();
        try
        {
            await sut.StartRecordingAsync(cameraId);

            var act = () => sut.StartRecordingAsync(cameraId);
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*already recording*");
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task StartRecordingAsync_UsesRingBufferSize_FromSettings_WhenNotProvided()
    {
        const string cameraId = "CAM_SR_04";
        var cam = MakeCamera(cameraId);
        var openCam = Substitute.For<IOpenCamera>();

        _vmbSystem.GetCameraByID(cameraId).Returns(cam);
        cam.Open().Returns(openCam);
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        _storage.GetCaptureFolder(Arg.Any<string>(), Arg.Any<DateTime>()).Returns("/captures");
        _repository.CreateRecordingSessionAsync(Arg.Any<RecordingSessionRecord>()).Returns(1);

        var sut = BuildSut();
        try
        {
            await sut.StartRecordingAsync(cameraId);  // no ringBufferSize arg

            var json = JsonSerializer.Serialize(sut.GetActiveSessions());
            json.Should().Contain($"\"ringBufferSize\":{_settings.RingBufferSize}");
        }
        finally { RemoveSession(cameraId); }
    }

    // ── StopRecordingAsync ────────────────────────────────────────────────────

    [Fact]
    public async Task StopRecordingAsync_RemovesSession_FromActiveSessions()
    {
        const string cameraId = "CAM_STOP_01";
        InjectSession(cameraId, BuildStoppedSession(cameraId));

        await BuildSut().StopRecordingAsync(cameraId);

        Sessions().Should().NotContainKey(cameraId);
    }

    [Fact]
    public async Task StopRecordingAsync_UpdatesRepository_WithEndTime()
    {
        const string cameraId = "CAM_STOP_02";
        var session = BuildStoppedSession(cameraId);
        session.RecordingId = 99;
        InjectSession(cameraId, session);

        await BuildSut().StopRecordingAsync(cameraId);

        await _repository.Received(1).UpdateRecordingSessionAsync(
            99, Arg.Any<Action<RecordingSessionRecord>>());
    }

    [Fact]
    public async Task StopRecordingAsync_DoesNotThrow_WhenSessionNotFound()
    {
        var act = () => BuildSut().StopRecordingAsync("GHOST_CAMERA");
        await act.Should().NotThrowAsync();
    }

    // ── SetFabricState ────────────────────────────────────────────────────────

    [Fact]
    public void SetFabricState_Throws_WhenNoSessionExists()
    {
        var act = () => BuildSut().SetFabricState("GHOST_CAM", false);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*No active recording session*");
    }

    [Fact]
    public void SetFabricState_StopsFabric()
    {
        const string cameraId = "CAM_FAB_01";
        var openCam = Substitute.For<IOpenCamera>();
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        var session = new ActiveRecordingSession
        {
            CameraId = cameraId,
            OpenCamera = openCam,
            RecordingId = 1,
            IsRecording = true,
            RingBufferSize = 100,
            Acquisition = Substitute.For<IAcquisition>(),
        };
        InjectSession(cameraId, session);
        try
        {
            BuildSut().SetFabricState(cameraId, false);
            session.FabricIsMoving.Should().BeFalse();
            session.IsPaused.Should().BeTrue();
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public void SetFabricState_ResumesFabric()
    {
        const string cameraId = "CAM_FAB_02";
        var openCam = Substitute.For<IOpenCamera>();
        openCam.StartFrameAcquisition().Returns(Substitute.For<IAcquisition>());
        var session = new ActiveRecordingSession
        {
            CameraId = cameraId,
            OpenCamera = openCam,
            RecordingId = 1,
            IsRecording = true,
            RingBufferSize = 100,
        };
        session.SetFabricState(false); // start paused
        InjectSession(cameraId, session);
        try
        {
            BuildSut().SetFabricState(cameraId, true);
            session.FabricIsMoving.Should().BeTrue();
            session.IsPaused.Should().BeFalse();
        }
        finally { RemoveSession(cameraId); }
    }

    // ── CaptureDefectAsync ────────────────────────────────────────────────────

    [Fact]
    public async Task CaptureDefectAsync_Throws_WhenNoSession()
    {
        var act = () => BuildSut().CaptureDefectAsync("GHOST_CAM");
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*No active recording session*");
    }

    [Fact]
    public async Task CaptureDefectAsync_Throws_WhenFabricIsMoving()
    {
        const string cameraId = "CAM_CAP_01";
        var session = new ActiveRecordingSession
        {
            CameraId = cameraId,
            OpenCamera = Substitute.For<IOpenCamera>(),
            RecordingId = 1,
            IsRecording = true,
            RingBufferSize = 100,
            // FabricIsMoving defaults to true
        };
        InjectSession(cameraId, session);
        try
        {
            var act = () => BuildSut().CaptureDefectAsync(cameraId);
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*Fabric must be stopped*");
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_Throws_WhenBufferIsEmpty()
    {
        const string cameraId = "CAM_CAP_02";
        InjectSession(cameraId, BuildStoppedSession(cameraId, frameCount: 0));
        try
        {
            var act = () => BuildSut().CaptureDefectAsync(cameraId);
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*buffer is empty*");
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_Throws_WhenRulerPositionOutOfRange()
    {
        const string cameraId = "CAM_CAP_03";
        InjectSession(cameraId, BuildStoppedSession(cameraId, frameCount: 30));
        try
        {
            var act = () => BuildSut().CaptureDefectAsync(cameraId, rulerPosition: 99);
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*out of range*");
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_UsesDefaultOffset_WhenNoRulerPosition()
    {
        const string cameraId = "CAM_CAP_04";
        InjectSession(cameraId, BuildStoppedSession(cameraId, frameCount: 50));
        SetupCaptureStorageMocks(cameraId);
        try
        {
            var result = await BuildSut().CaptureDefectAsync(cameraId);

            // CalculatedOffsetFrames = rulerDerivedOffset ?? offset, where offset = offsetFrames ?? settings.DefaultOffsetFrames
            result.CalculatedOffsetFrames.Should().Be(_settings.DefaultOffsetFrames);
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_UsesRulerDerivedOffset_WhenRulerPositionProvided()
    {
        // Position 1: distance = 50 + 0.5×5 = 52.5 cm → framesBack = round(52.5/0.4) = 131
        const string cameraId = "CAM_CAP_05";
        const int rulerPos = 1;
        const int expectedFrames = 131;

        InjectSession(cameraId, BuildStoppedSession(cameraId, frameCount: 200));
        SetupCaptureStorageMocks(cameraId);
        try
        {
            var result = await BuildSut().CaptureDefectAsync(cameraId, rulerPosition: rulerPos);

            result.RulerPosition.Should().Be(rulerPos);
            result.CalculatedOffsetFrames.Should().Be(expectedFrames);
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_StoresRulerDerivedOffset_EvenWhenExplicitOffsetProvided()
    {
        // CalculatedOffsetFrames always reflects the ruler position for traceability.
        // The explicit offsetFrames affects which frames are selected, but what is
        // persisted in the snapshot is rulerDerivedOffset (131 for position 1).
        const string cameraId = "CAM_CAP_06";
        const int expectedRulerOffset = 131; // pos 1 → 52.5 cm / 0.4 = 131
        InjectSession(cameraId, BuildStoppedSession(cameraId, frameCount: 50));
        SetupCaptureStorageMocks(cameraId);
        try
        {
            var result = await BuildSut().CaptureDefectAsync(cameraId, offsetFrames: 10, rulerPosition: 1);

            result.CalculatedOffsetFrames.Should().Be(expectedRulerOffset);
            result.RulerPosition.Should().Be(1);
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_SavesSnapshot_AndCallsRepository()
    {
        const string cameraId = "CAM_CAP_07";
        InjectSession(cameraId, BuildStoppedSession(cameraId, frameCount: 30));
        SetupCaptureStorageMocks(cameraId);
        try
        {
            await BuildSut().CaptureDefectAsync(cameraId);

            await _repository.Received(1).SaveSnapshotAsync(
                Arg.Is<InspectionSnapshot>(s => s.CameraFrameId >= 0));
        }
        finally { RemoveSession(cameraId); }
    }

    [Fact]
    public async Task CaptureDefectAsync_SetsRecordingId_FromActiveSession()
    {
        const string cameraId = "CAM_CAP_08";
        var session = BuildStoppedSession(cameraId, frameCount: 30);
        session.RecordingId = 77;
        InjectSession(cameraId, session);
        SetupCaptureStorageMocks(cameraId);
        try
        {
            var result = await BuildSut().CaptureDefectAsync(cameraId);

            result.RecordingId.Should().Be(77);
        }
        finally { RemoveSession(cameraId); }
    }
}
