using Textil_backend.Models;

namespace Textil_backend.Interfaces;

public interface IVimbaCameraService
{
    IReadOnlyList<CameraInfoDto> GetCameras();
    IReadOnlyList<object> GetActiveSessions();
    Task<string> StartRecordingAsync(string cameraId, string? machineState = null, int? ringBufferSize = null, int? startedByUserId = null, string? startedByUsername = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Starts a virtual recording session fed from local .bin frame files in <paramref name="folderPath"/>
    /// instead of a physical camera. Every frame in the folder is loaded into the ring buffer (in numeric
    /// order), so the whole capture/stitch pipeline works exactly as with a live camera. Returns the
    /// virtual camera id used and the number of frames loaded.
    /// </summary>
    Task<(string CameraId, int TotalFrames)> StartLocalRecordingAsync(string folderPath, string? machineState = null, int? startedByUserId = null, string? startedByUsername = null, CancellationToken cancellationToken = default);

    Task StopRecordingAsync(string cameraId);
    Task<InspectionSnapshot> CaptureSnapshotAsync(string cameraId, string? machineState = null, string? notes = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets the fabric movement state for an active session.
    /// When isMoving=false, the ring buffer stops accepting new frames (simulates fabric stopped).
    /// </summary>
    void SetFabricState(string cameraId, bool isMoving);

    /// <summary>
    /// Captures the defect image by going back offsetFrames in the ring buffer and stitching
    /// frameCount frames into a single reconstructed image (simulates line-scan output).
    /// Requires FabricIsMoving == false (fabric must be stopped).
    /// When rulerPosition is provided, offsetFrames is calculated from the ruler number
    /// using the configured MmPerRulerUnit and MmPerFrame settings.
    /// </summary>
    Task<InspectionSnapshot> CaptureDefectAsync(
        string cameraId,
        int? offsetFrames = null,
        int? frameCount = null,
        string? machineState = null,
        string? notes = null,
        int? rulerPosition = null,
        CancellationToken ct = default);
}
