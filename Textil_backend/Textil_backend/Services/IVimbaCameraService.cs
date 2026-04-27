using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using Textil_backend.Interfaces;
using Textil_backend.Models;
using VmbNET;

namespace Textil_backend.Services;

public class VimbaCameraService : IVimbaCameraService, IDisposable
{
    private readonly IImageProcessingService _imageProcessor;
    private readonly IStorageService _storage;
    private readonly IInspectionRepository _repository;
    private readonly ILogger<VimbaCameraService> _logger;
    private readonly IVmbSystem _vmbSystem;
    private readonly IOptionsMonitor<FabricSettings> _fabricSettings;

    private static readonly ConcurrentDictionary<string, ActiveRecordingSession> _sessions =
        new(StringComparer.OrdinalIgnoreCase);

    public VimbaCameraService(
        IImageProcessingService imageProcessor,
        IStorageService storage,
        IInspectionRepository repository,
        ILogger<VimbaCameraService> logger,
        IOptionsMonitor<FabricSettings> fabricSettings,
        IVmbSystem? vmbSystem = null)
    {
        _imageProcessor = imageProcessor;
        _storage = storage;
        _repository = repository;
        _logger = logger;
        _fabricSettings = fabricSettings;
        _vmbSystem = vmbSystem ?? IVmbSystem.Startup();
    }

    public IReadOnlyList<CameraInfoDto> GetCameras()
    {
        return _vmbSystem.GetCameras().Select(c => new CameraInfoDto
        {
            Id = c.Id,
            Serial = c.Serial,
            Name = c.Name,
            ModelName = c.ModelName,
            InterfaceName = c.Interface?.Name
        }).ToList();
    }

    public IReadOnlyList<object> GetActiveSessions()
    {
        return _sessions.Values.Select(s => (object)new
        {
            cameraId = s.CameraId,
            recordingId = s.RecordingId,
            sessionName = s.SessionName,
            isRecording = s.IsRecording,
            totalFrames = s.TotalFrames,
            latestFrameId = s.LatestFrameId,
            fabricIsMoving = s.FabricIsMoving,
            isPaused = s.IsPaused,
            bufferFrameCount = s.BufferFrameCount,
            ringBufferSize = s.RingBufferSize
        }).ToList();
    }

    public async Task<string> StartRecordingAsync(string cameraId, string? machineState = null, int? ringBufferSize = null, CancellationToken ct = default)
    {
        var settings = _fabricSettings.CurrentValue;
        var normalizedId = cameraId.Trim();
        if (_sessions.ContainsKey(normalizedId))
            throw new InvalidOperationException($"Camera {normalizedId} is already recording.");

        var camera = ResolveCamera(normalizedId);
        var startedAt = DateTime.UtcNow;
        var folder = _storage.GetCaptureFolder(camera.Id, startedAt);
        _storage.EnsureDirectoryExists(folder);

        var recordingId = await _repository.CreateRecordingSessionAsync(new RecordingSessionRecord
        {
            SessionName = $"{machineState ?? "Manual"}_{camera.Id}_{startedAt:yyyyMMdd_HHmmss}",
            FilePath = folder,
            StartTime = startedAt,
            Status = "Active"
        });

        var openCamera = camera.Open();
        var session = new ActiveRecordingSession
        {
            CameraId = camera.Id,
            OpenCamera = openCamera,
            OutputFolder = folder,
            RecordingId = recordingId,
            IsRecording = true,
            StartedAtUtc = startedAt,
            RingBufferSize = ringBufferSize ?? settings.RingBufferSize
        };

        openCamera.FrameReceived += async (_, e) =>
        {
            try
            {
                using var frame = e.Frame;
                if (!session.IsRecording) return;

                var bytes = _imageProcessor.ExtractFrameBytes(frame);
                session.AddFrame(new FrameEntry
                {
                    FrameId = (long)frame.Id,
                    Bytes = bytes,
                    Width = frame.Width,
                    Height = frame.Height,
                    PixelFormat = frame.PixelFormat,
                    TimestampUtc = DateTime.UtcNow
                });
                _logger.LogInformation(
                    "Frame {FrameId}: {Width}x{Height}, format={PixelFormat}, size={SizeBytes} bytes ({SizeKb:F2} KB, {SizeMb:F2} MB)",
                    frame.Id,
                    frame.Width,
                    frame.Height,
                    frame.PixelFormat,
                    frame.BufferSize,
                    frame.BufferSize / 1024.0,
                    frame.BufferSize / (1024.0 * 1024.0)
                );


                // Uncomment to save every frame to disk during recording:
                // var fullPath = Path.Combine(folder, _storage.GenerateFileName("frame", (long)frame.Id));
                // await File.WriteAllBytesAsync(fullPath, bytes);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing frame for camera {Id}", camera.Id);
            }
        };

        session.Acquisition = openCamera.StartFrameAcquisition();
        _sessions.TryAdd(normalizedId, session);

        return folder;
    }

    public async Task StopRecordingAsync(string cameraId)
    {
        if (_sessions.TryRemove(cameraId.Trim(), out var session))
        {
            await _repository.UpdateRecordingSessionAsync(session.RecordingId, r => {
                r.EndTime = DateTime.UtcNow;
                r.TotalFrames = session.TotalFrames;
                r.InitialFrameId = (int)session.InitialFrameId;
                r.Status = "Completed";
            });
            session.IsRecording = false;
            session.Dispose();
        }
    }

    public void SetFabricState(string cameraId, bool isMoving)
    {
        if (!_sessions.TryGetValue(cameraId.Trim(), out var session))
            throw new InvalidOperationException($"No active recording session for camera {cameraId}.");

        session.SetFabricState(isMoving);

        if (isMoving)
        {
            // Resume: restart Vimba frame acquisition (simulates encoder pulses resuming)
            try { session.Acquisition?.Dispose(); } catch { }
            session.Acquisition = session.OpenCamera.StartFrameAcquisition();
            _logger.LogInformation("Camera {CameraId} acquisition resumed", cameraId);
        }
        else
        {
            // Pause: stop Vimba frame delivery (simulates encoder stopped)
            try
            {
                session.Acquisition?.Dispose();
                session.Acquisition = null!;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error pausing acquisition for camera {CameraId}", cameraId);
            }
            _logger.LogInformation("Camera {CameraId} acquisition paused", cameraId);
        }
    }

    public async Task<InspectionSnapshot> CaptureDefectAsync(
        string cameraId,
        int? offsetFrames = null,
        int? frameCount = null,
        string? machineState = null,
        string? notes = null,
        int? rulerPosition = null,
        CancellationToken ct = default)
    {
        if (!_sessions.TryGetValue(cameraId.Trim(), out var session))
            throw new InvalidOperationException($"No active recording session for camera {cameraId}.");

        if (session.FabricIsMoving)
            throw new InvalidOperationException("Fabric must be stopped before capturing a defect. Call /fabric-state first with isMoving=false.");

        var buffer = session.GetBufferSnapshot();
        if (buffer.Length == 0)
            throw new InvalidOperationException("Ring buffer is empty. No frames captured yet.");

        var settings = _fabricSettings.CurrentValue;

        // Ruler-based offset: derive frames from the physical center distance of the ruler position.
        //
        //   distance_cm = RulerBaseDistanceCm + (position - 0.5) × RulerPositionSpacingCm
        //   frames_back = distance_cm / CmPerFrame
        //
        // This correctly accounts for the base gap between the camera and the ruler start.
        int? rulerDerivedOffset = null;
        if (rulerPosition.HasValue)
        {
            if (!settings.IsValidPosition(rulerPosition.Value))
                throw new InvalidOperationException(
                    $"Ruler position {rulerPosition.Value} is out of range. " +
                    $"Valid positions: 1 – {settings.RulerPositionCount}.");

            var distanceCm = settings.GetDistanceCm(rulerPosition.Value);
            rulerDerivedOffset = settings.GetFramesBack(rulerPosition.Value);

            _logger.LogInformation(
                "Ruler position {Position}: distance={Distance:F1} cm from camera → {Frames} frames back " +
                "(base={Base} cm, spacing={Spacing} cm, cmPerFrame={CmPerFrame})",
                rulerPosition.Value, distanceCm, rulerDerivedOffset.Value,
                settings.RulerBaseDistanceCm, settings.RulerPositionSpacingCm,
                settings.CmPerFrame);
        }

        // Priority: explicit offsetFrames > ruler-derived > default
        var offset = offsetFrames ?? rulerDerivedOffset ?? settings.DefaultOffsetFrames;
        var count = frameCount ?? settings.DefaultFrameCount;

        // Center index in the buffer: buffer_end - offset
        var centerIdx = buffer.Length - 1 - offset;
        centerIdx = Math.Clamp(centerIdx, 0, buffer.Length - 1);

        // frameCount = frames on each side of center → total = 2*frameCount + 1
        var startIdx = Math.Max(0, centerIdx - count);
        var endIdx = Math.Min(buffer.Length - 1, centerIdx + count);

        var selectedFrames = buffer[startIdx..(endIdx + 1)];

        if (selectedFrames.Length == 0)
            throw new InvalidOperationException($"Not enough frames in buffer. Buffer has {buffer.Length} frames but offset requested {offset}.");

        _logger.LogInformation(
            "Defect capture: buffer={Total}, offset={Offset}, center={Center}, selected={Selected} frames",
            buffer.Length, offset, centerIdx, selectedFrames.Length);

        // Use dimensions from the center frame
        var refFrame = buffer[centerIdx];
        var stitched = _imageProcessor.StitchFrames(selectedFrames, refFrame.Width, refFrame.Height, refFrame.PixelFormat);

        return await SaveAndRecordSnapshot(
            session.CameraId, stitched, refFrame.FrameId,
            refFrame.Width, (uint)selectedFrames.Length,
            refFrame.PixelFormat, session.RecordingId,
            machineState ?? "DefectCapture", notes,
            null, rulerPosition, rulerDerivedOffset ?? offset, ct);
    }

    public async Task<InspectionSnapshot> CaptureSnapshotAsync(string cameraId, string? machineState = null, string? notes = null, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(cameraId.Trim(), out var session))
        {
            if (session.LatestFrameBytes == null)
                throw new InvalidOperationException("No frames available yet.");

            return await SaveAndRecordSnapshot(session.CameraId, session.LatestFrameBytes, session.LatestFrameId,
                session.LatestFrameWidth, session.LatestFrameHeight, session.LatestPixelFormat, session.RecordingId, machineState, notes, ct);
        }

        var camera = ResolveCamera(cameraId);
        using var open = camera.Open();
        using var frame = open.AcquireSingleImage(TimeSpan.FromSeconds(10));

        var bytes = _imageProcessor.ExtractFrameBytes(frame);
        return await SaveAndRecordSnapshot(camera.Id, bytes, (long)frame.Id,
            frame.Width, frame.Height, frame.PixelFormat, null, machineState, notes, ct);
    }

    private async Task<InspectionSnapshot> SaveAndRecordSnapshot(
        string camId, byte[] bytes, long fId, uint w, uint h, IFrame.PixelFormatValue fmt,
        int? recId, string? st, string? nt, CancellationToken ct)
        => await SaveAndRecordSnapshot(camId, bytes, fId, w, h, fmt, recId, st, nt, null, null, null, ct);

    private async Task<InspectionSnapshot> SaveAndRecordSnapshot(
        string camId, byte[] bytes, long fId, uint w, uint h, IFrame.PixelFormatValue fmt,
        int? recId, string? st, string? nt,
        string? defectType, int? rulerPosition, int? calculatedOffset,
        CancellationToken ct)
    {
        var folder = _storage.GetSnapshotFolder(camId);
        _storage.EnsureDirectoryExists(folder);

        var binName = _storage.GenerateFileName("snapshot", fId);
        var fullPath = Path.Combine(folder, binName);

        await File.WriteAllBytesAsync(fullPath, bytes, ct);
        await _imageProcessor.TryWritePngAsync(Path.ChangeExtension(fullPath, ".png"), bytes, w, h, fmt, ct);

        var snapshot = new InspectionSnapshot
        {
            RecordingId = recId,
            FileName = binName,
            FileRelativePath = _storage.GetRelativePath(fullPath),
            CaptureTimestamp = DateTime.UtcNow,
            CameraFrameId = fId,
            MachineState = st ?? "Snapshot",
            Notes = nt,
            DefectType = defectType,
            RulerPosition = rulerPosition,
            CalculatedOffsetFrames = calculatedOffset
        };

        await _repository.SaveSnapshotAsync(snapshot);
        return snapshot;
    }

    private ICamera ResolveCamera(string cameraId)
    {
        try { return _vmbSystem.GetCameraByID(cameraId); }
        catch
        {
            return _vmbSystem.GetCameras().FirstOrDefault(c =>
                c.Id.Contains(cameraId, StringComparison.OrdinalIgnoreCase) ||
                c.Serial.Contains(cameraId, StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidOperationException($"Camera {cameraId} not found.");
        }
    }

    public void Dispose()
    {
        foreach (var s in _sessions.Values) s.Dispose();
        _sessions.Clear();
        _vmbSystem.Dispose();
    }
}
