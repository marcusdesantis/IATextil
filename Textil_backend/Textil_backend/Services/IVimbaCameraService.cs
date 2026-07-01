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

    // One gate per camera so concurrent start-recording requests can't open the same camera in parallel.
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _startGates =
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

    public async Task<string> StartRecordingAsync(string cameraId, string? machineState = null, int? ringBufferSize = null, int? startedByUserId = null, string? startedByUsername = null, CancellationToken ct = default)
    {
        var settings = _fabricSettings.CurrentValue;
        var normalizedId = cameraId.Trim();

        // Serialize start attempts PER CAMERA. The frontend can fire start-recording more than once
        // (double-click / re-render). Two concurrent starts would open the same camera in parallel —
        // one then fails with VmbErrorAlready while queueing frames, the other with AcquisitionStart
        // InternalFault, and the orphaned acquisition can crash the process on finalize.
        var gate = _startGates.GetOrAdd(normalizedId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            return await StartRecordingCoreAsync(normalizedId, settings, machineState, ringBufferSize, startedByUserId, startedByUsername, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<string> StartRecordingCoreAsync(string normalizedId, FabricSettings settings,
        string? machineState, int? ringBufferSize, int? startedByUserId, string? startedByUsername, CancellationToken ct)
    {
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
            Status = "Active",
            StartedByUserId = startedByUserId,
            StartedByUsername = startedByUsername
        });

        IOpenCamera openCamera;
        try
        {
            openCamera = camera.Open();
        }
        catch (Exception ex)
        {
            await MarkSessionFailed(recordingId);
            throw new InvalidOperationException($"Failed to open camera {camera.Id}: {ex.Message}", ex);
        }

        if (openCamera is null)
        {
            await MarkSessionFailed(recordingId);
            throw new InvalidOperationException(
                $"Camera {camera.Id} could not be opened (the transport layer returned no handle). " +
                "Check that the camera is reachable and not claimed by another transport (e.g. RDMA).");
        }

        ConfigureCamera(openCamera, camera.ModelName);

        // GigE Vision packet-size negotiation — REQUIRED, and exactly what the Vimba X Viewer does on
        // connect. The camera advertises GevSCPSPacketSize=1456 (its minimum), far too small for the
        // 34 MB frames → severe packet loss → incomplete (0-byte) frames. This call negotiates the
        // largest packet the NIC path supports. It is the standard GigE stream handshake, NOT a camera
        // feature override (exposure/gain/trigger are still left untouched). Without it, frames arrive
        // empty. This is how it worked before; do not gate it off.
        LogPacketSizeRange(openCamera, camera.ModelName);
        AdjustStreamPacketSize(openCamera, camera.ModelName);
        LogPacketSizeRange(openCamera, camera.ModelName); // show the negotiated value (should be > 1456)

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

                // Drop incomplete frames. On 10GigE a too-small GevSCPSPacketSize (here 1456) causes
                // packet loss / incomplete delivery: the frame's Buffer comes back null even though
                // BufferSize is announced, so ExtractFrameBytes returns fewer bytes than the full image.
                // Storing those produced 0-byte snapshots. Only buffer frames that carry full pixel data.
                var expectedBytes = (long)frame.Width * frame.Height * BytesPerPixel(frame.PixelFormat);
                if (bytes.Length == 0 || bytes.Length < expectedBytes)
                {
                    _logger.LogWarning(
                        "Dropping INCOMPLETE frame {FrameId}: got {Got}, expected {Expected} (announced={Announced}). " +
                        "FrameStatus={Status}, Buffer=0x{Buf:X}, ImageData=0x{Img:X}.",
                        frame.Id, bytes.Length, expectedBytes, frame.BufferSize,
                        frame.FrameStatus, frame.Buffer.ToInt64(), frame.ImageData.ToInt64());

                    // Once, after a few frames, dump the stream packet statistics so we can see whether
                    // packets are being LOST (transport/filter-driver issue) or not arriving at all.
                    if ((long)frame.Id == 8)
                        LogStreamStatistics(openCamera, camera.ModelName);
                    return;
                }

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
                    "Frame {FrameId}: {Width}x{Height}, format={PixelFormat}, bytes={ActualBytes} ({SizeMb:F2} MB) [OK]",
                    frame.Id,
                    frame.Width,
                    frame.Height,
                    frame.PixelFormat,
                    bytes.Length,
                    bytes.Length / (1024.0 * 1024.0)
                );

                // TEST ONLY (FabricSimulation.SaveAllFrames=true): dump every complete frame to disk
                // as .bin + .png so we can verify in real time that incoming frames carry real pixel
                // data. Very heavy (~33 MB/frame) — keep off in normal operation.
                if (_fabricSettings.CurrentValue.SaveAllFrames)
                {
                    var framePath = Path.Combine(folder, _storage.GenerateFileName("frame", (long)frame.Id, ".bin"));
                    await File.WriteAllBytesAsync(framePath, bytes);
                    await _imageProcessor.TryWritePngAsync(
                        Path.ChangeExtension(framePath, ".png"),
                        bytes, frame.Width, frame.Height, frame.PixelFormat, CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing frame for camera {Id}", camera.Id);
            }
        };

        try
        {
            session.Acquisition = openCamera.StartFrameAcquisition(
                VmbNET.ICapturingModule.AllocationModeValue.AllocAndAnnounceFrame, 10);
        }
        catch (Exception ex)
        {
            // Acquisition failed to start (e.g. AcquisitionStart InternalFault). VmbNET leaves a
            // half-constructed Acquisition object behind; its finalizer later runs CaptureEnd and,
            // once the camera is disposed, crashes the whole process with an unhandled BadHandle.
            // Force that orphan to finalize NOW, while the stream handle is still valid, THEN dispose.
            _logger.LogError(ex, "Failed to start frame acquisition for camera {Id}; releasing camera", camera.Id);
            GC.Collect();
            GC.WaitForPendingFinalizers();
            try { openCamera.Dispose(); } catch { /* best effort */ }
            await MarkSessionFailed(recordingId);
            throw;
        }

        _sessions.TryAdd(normalizedId, session);

        return folder;
    }

    private async Task MarkSessionFailed(int recordingId)
    {
        try
        {
            await _repository.UpdateRecordingSessionAsync(recordingId, r =>
            {
                r.EndTime = DateTime.UtcNow;
                r.Status = "Failed";
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not mark recording session {RecordingId} as failed", recordingId);
        }
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
            session.Acquisition = session.OpenCamera.StartFrameAcquisition(
                VmbNET.ICapturingModule.AllocationModeValue.AllocAndAnnounceFrame, 10);
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
            throw new InvalidOperationException(
                "Ring buffer is empty — no COMPLETE frames were stored. In encoder mode each frame needs " +
                "~4096 triggered lines, so keep the fabric moving steadily for a few seconds before capturing. " +
                "If the log shows 'Dropping INCOMPLETE frame', the frames are arriving without pixel data.");

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

        // Center index in the buffer: buffer_end - offset → which frame to show.
        var centerIdx = buffer.Length - 1 - offset;
        centerIdx = Math.Clamp(centerIdx, 0, buffer.Length - 1);

        var refFrame = buffer[centerIdx];

        // Compose a window of frames CENTERED on the reference frame and stack them into one
        // continuous fabric image. Each camera frame is a thin strip along the travel direction
        // (e.g. 2000×200), so a single frame alone is an unusably thin slice — stacking the
        // surrounding frames reconstructs the fabric around the defect. StitchFullFrames keeps every
        // row of each frame (unlike the 1-row-per-frame StitchFrames used for true 1-line line-scan).
        //
        // frameCount is interpreted PER SIDE (±), matching the UI "Per lato (±)" setting: we take up
        // to `framesPerSide` frames BEFORE and AFTER the center, so the window spans up to
        // 2·framesPerSide + 1 frames. It is clamped to what the ring buffer actually holds — if the
        // buffer has fewer frames than requested, the window is smaller and a larger per-side value
        // produces the same image (nothing more to stack).
        var framesPerSide = Math.Max(0, frameCount ?? settings.DefaultFrameCount);

        var start = Math.Max(0, centerIdx - framesPerSide);
        var end = Math.Min(buffer.Length - 1, centerIdx + framesPerSide);
        var count = end - start + 1;

        var window = new FrameEntry[count];
        Array.Copy(buffer, start, window, 0, count);

        // Frame IDs of the span (ascending: oldest→newest) for the info banner — captured before the
        // reverse below so the banner keeps reading low→high.
        var oldestFrameId = window[0].FrameId;
        var newestFrameId = window[count - 1].FrameId;

        // Stack newest→oldest so the composed strip's travel axis runs in the SAME direction as the
        // physical ruler: the older frames (fabric that passed the camera first, i.e. now at the HIGH
        // cm end of the ruler) end up on one consistent side. This only reverses the left/right of the
        // final (rotated) image — it does NOT mirror each frame's pixels. If the ruler ends up reading
        // the other way, remove this single line to flip it back.
        Array.Reverse(window);

        var stitched = _imageProcessor.StitchFullFrames(
            window, refFrame.Width, refFrame.PixelFormat, out var stitchedHeight);

        // Fallback to the single reference frame if stitching produced nothing (e.g. mismatched frames).
        var outBytes = stitched.Length > 0 ? stitched : refFrame.Bytes;
        var outHeight = stitched.Length > 0 ? stitchedHeight : refFrame.Height;

        var framesBack = centerIdx - start;     // older side actually taken
        var framesFwd = end - centerIdx;         // newer side actually taken
        _logger.LogInformation(
            "Defect capture: buffer={Total}, offset={Offset}, center={Center}, perSide(req)={PerSide}, " +
            "back={Back}, fwd={Fwd}, total={Count} frames, stitched={Width}x{Height}",
            buffer.Length, offset, centerIdx, framesPerSide, framesBack, framesFwd, count,
            refFrame.Width, outHeight);

        // If either side is clamped below what was requested, a larger "Per lato" can't add frames
        // there — the visual result won't change on that side. Surface it so it's obvious in the log.
        if (framesBack < framesPerSide || framesFwd < framesPerSide)
            _logger.LogWarning(
                "Defect capture window CLAMPED: requested {PerSide}/side but got back={Back}, fwd={Fwd} " +
                "(center is {DistFromEnd} frames from the newest end of a {Total}-frame buffer). " +
                "Increasing 'Per lato' beyond this only extends the side that still has frames.",
                framesPerSide, framesBack, framesFwd, buffer.Length - 1 - centerIdx, buffer.Length);

        var snapshot = await SaveAndRecordSnapshot(
            session.CameraId, outBytes, refFrame.FrameId,
            refFrame.Width, outHeight,
            refFrame.PixelFormat, session.RecordingId,
            machineState ?? "DefectCapture", notes,
            null, rulerPosition, rulerDerivedOffset ?? offset, ct);

        // Attach composition info so the viewer can show what was stitched (transient, not persisted).
        snapshot.StitchedFrameCount = count;
        snapshot.FramesBack = framesBack;
        snapshot.FramesForward = framesFwd;
        snapshot.StitchedWidth = (int)refFrame.Width;
        snapshot.StitchedHeight = (int)outHeight;
        snapshot.BufferFrameCount = buffer.Length;
        snapshot.FirstFrameId = oldestFrameId;
        snapshot.LastFrameId = newestFrameId;

        return snapshot;
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

    private void ConfigureCamera(IOpenCamera openCamera, string modelName)
    {
        // EXPERIMENT: do NOT touch any feature. The camera streams in the viewer with its own saved
        // configuration; forcing AcquisitionMode/TriggerMode may be what breaks AcquisitionStart on
        // this line-scan sensor (TriggerMode=Off can disable the line trigger it needs). Start with
        // exactly the config the viewer uses. If this works, we re-introduce only what's strictly needed.
        _ = openCamera; // keep the camera handle referenced; intentionally not configuring features
        _logger.LogInformation("Camera {Model}: leaving saved configuration untouched (no feature overrides)", modelName);
    }

    /// <summary>
    /// Best-effort dump of the GigE stream packet statistics, so we can tell whether packets are
    /// being LOST in reception (transport/Filter-Driver issue) or simply not arriving. Diagnostics only.
    /// </summary>
    private void LogStreamStatistics(IOpenCamera openCamera, string modelName)
    {
        try
        {
            dynamic sf = openCamera.Stream.Features;
            foreach (var name in new[]
            {
                "StatFrameDelivered", "StatFrameDropped", "StatFrameUnderrun", "StatFrameShoved",
                "StatPacketReceived", "StatPacketMissed", "StatPacketErrors", "StatPacketRequested", "StatPacketResent"
            })
            {
                try
                {
                    dynamic f = sf[name];
                    _logger.LogWarning("[{Model}] STREAM STAT {Name} = {Value}", modelName, name, (object)f.Value);
                }
                catch { /* feature not present on this transport — skip */ }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read stream statistics on {Model}", modelName);
        }
    }

    private static int BytesPerPixel(IFrame.PixelFormatValue fmt) => fmt switch
    {
        IFrame.PixelFormatValue.Mono8 => 1,
        IFrame.PixelFormatValue.BGR8 or IFrame.PixelFormatValue.RGB8 => 3,
        IFrame.PixelFormatValue.BGRa8 or IFrame.PixelFormatValue.RGBa8 => 4,
        _ => 3
    };

    private void TrySetFeature(string modelName, string featureName, Action set)
    {
        try
        {
            set();
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Feature {Feature} not applied on {Model}: {Reason}. Keeping camera default.",
                featureName, modelName, ex.Message);
        }
    }

    /// <summary>
    /// Negotiates the GVSP packet size on the STREAM module (not the remote device), mirroring what
    /// the Vimba/CGT viewer does. Without this, 10GigE cameras commonly fault AcquisitionStart.
    /// Best-effort and resilient to the exact command name varying per transport layer.
    /// </summary>
    private void AdjustStreamPacketSize(IOpenCamera openCamera, string modelName)
    {
        // The GVSPAdjustPacketSize negotiation stays stuck at 1456 over our transport, yet the Vimba
        // Viewer/GCT stream fine on the SAME NIC + camera — so the path clearly supports big packets.
        // So we do what the viewer effectively does: SET GevSCPSPacketSize directly to its maximum,
        // so a 34 MB frame arrives in few enough packets to complete (no loss). This is a transport
        // setting (stream packet size), not an image-feature override (exposure/gain/trigger untouched).
        try
        {
            dynamic features = openCamera.Features;
            dynamic pkt = features["GevSCPSPacketSize"];
            long max = (long)pkt.Maximum;
            _logger.LogInformation("[{Model}] Setting GevSCPSPacketSize to its maximum {Max} (was {Cur})...",
                modelName, max, (long)pkt.Value);
            TrySetFeature(modelName, $"GevSCPSPacketSize:={max}", () => { pkt.Value = max; });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not set GevSCPSPacketSize on {Model}", modelName);
        }
    }

    /// <summary>
    /// Reads and logs the GevSCPSPacketSize feature range (value/min/max) from the device, so we can
    /// see what packet sizes this 10GigE camera actually accepts. Diagnostics only, best-effort.
    /// </summary>
    private void LogPacketSizeRange(IOpenCamera openCamera, string modelName)
    {
        try
        {
            dynamic features = openCamera.Features;
            dynamic pkt = features["GevSCPSPacketSize"];
            _logger.LogInformation("[{Model}] GevSCPSPacketSize: value={Value}, min={Min}, max={Max}",
                modelName, (long)pkt.Value, (long)pkt.Minimum, (long)pkt.Maximum);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[{Model}] Could not read GevSCPSPacketSize range: {Reason}", modelName, ex.Message);
        }
    }

    private ICamera ResolveCamera(string cameraId)
    {
        try { return _vmbSystem.GetCameraByID(cameraId); }
        catch
        {
            return _vmbSystem.GetCameras().FirstOrDefault(c =>
                (c.Id?.Contains(cameraId, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (c.Serial?.Contains(cameraId, StringComparison.OrdinalIgnoreCase) ?? false))
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
