using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Textil_backend.Interfaces;
using Textil_backend.Models;

namespace Textil_backend.Controllers;

public record CreateAnnotationRequest(int SectionIndex, string? DefectType = null);

public record StartLocalRecordingRequest(string FolderPath, string? MachineState = null);

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class InspectionController : ControllerBase
{
    private readonly IVimbaCameraService _vimbaCameraService;
    private readonly IOptionsMonitor<FabricSettings> _fabricSettings;
    private readonly IInspectionRepository _repository;
    private readonly IStorageService _storage;
    private readonly IImageProcessingService _imageProcessor;

    public InspectionController(
        IVimbaCameraService vimbaCameraService,
        IOptionsMonitor<FabricSettings> fabricSettings,
        IInspectionRepository repository,
        IStorageService storage,
        IImageProcessingService imageProcessor)
    {
        _vimbaCameraService = vimbaCameraService;
        _fabricSettings = fabricSettings;
        _repository = repository;
        _storage = storage;
        _imageProcessor = imageProcessor;
    }

    /// <summary>
    /// Returns the ruler configuration so the frontend can display accurate labels
    /// without hard-coding physical constants.
    /// </summary>
    [HttpGet("ruler-config")]
    public IActionResult GetRulerConfig()
    {
        var settings = _fabricSettings.CurrentValue;
        var defectTypes = settings.DefectTypes
            .Where(defectType => !string.IsNullOrWhiteSpace(defectType))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var positions = Enumerable.Range(1, settings.RulerPositionCount)
            .Select(p => new
            {
                position = p,
                distanceCm = settings.GetDistanceCm(p),
                framesBack = settings.GetFramesBack(p),
            });

        return Ok(new
        {
            defectTypes,
            imageSectionCount = settings.ImageSectionCount,
            positionCount = settings.RulerPositionCount,
            baseDistanceCm = settings.RulerBaseDistanceCm,
            positionSpacingCm = settings.RulerPositionSpacingCm,
            cmPerFrame = settings.CmPerFrame,
            positions,
        });
    }

    /// <summary>
    /// Returns the count of captured (classified) defects grouped by defect type
    /// within an optional date range. 'from' and 'to' are exact instants
    /// (ISO-8601 with offset): the caller sends the start of the first local day
    /// and the start of the day after the last local day, so the range honours the
    /// client's time zone. The window is treated as [from, to).
    /// </summary>
    [HttpGet("defect-stats")]
    public async Task<IActionResult> GetDefectStats([FromQuery] DateTimeOffset? from = null, [FromQuery] DateTimeOffset? to = null)
    {
        // Convert to UTC DateTime (Kind=Utc) — required by Npgsql for 'timestamp with time zone'.
        var fromUtc = from?.UtcDateTime;
        var toUtc = to?.UtcDateTime;

        var stats = await _repository.GetDefectStatisticsAsync(fromUtc, toUtc);

        return Ok(new
        {
            from = fromUtc,
            to = toUtc,
            total = stats.Sum(s => s.Count),
            byType = stats.Select(s => new
            {
                defectType = s.DefectType,
                count = s.Count,
            }),
        });
    }

    [HttpGet("cameras")]
    public IActionResult GetCameras()
    {
        var cameras = _vimbaCameraService.GetCameras();
        return Ok(cameras);
    }

    [HttpGet("active-sessions")]
    public IActionResult GetActiveSessions()
    {
        var sessions = _vimbaCameraService.GetActiveSessions();
        return Ok(sessions);
    }

    [HttpPost("start-recording/{cameraId}")]
    public async Task<IActionResult> StartRecording(string cameraId, [FromQuery] string? machineState = null, [FromQuery] int? ringBufferSize = null)
    {
        try
        {
            int? userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : null;
            var username = User.FindFirstValue(ClaimTypes.Name);

            var folder = await _vimbaCameraService.StartRecordingAsync(cameraId, machineState, ringBufferSize, userId, username);
            return Ok(new
            {
                Message = "Recording started",
                CameraId = cameraId,
                Folder = folder
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Failed to start recording: {ex.Message}" });
        }
    }

    /// <summary>
    /// Starts a virtual recording session fed from local .bin frames in the given folder instead of a
    /// physical camera. Loads every frame in the folder into the ring buffer so the whole capture/stitch
    /// pipeline works identically. Used to replay frames the client provided for testing.
    /// </summary>
    [HttpPost("start-local-recording")]
    public async Task<IActionResult> StartLocalRecording([FromBody] StartLocalRecordingRequest request)
    {
        try
        {
            int? userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : null;
            var username = User.FindFirstValue(ClaimTypes.Name);

            var (cameraId, totalFrames) = await _vimbaCameraService.StartLocalRecordingAsync(
                request.FolderPath, request.MachineState, userId, username);

            return Ok(new
            {
                Message = "Local recording started",
                CameraId = cameraId,
                Folder = request.FolderPath,
                TotalFrames = totalFrames
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Failed to start local recording: {ex.Message}" });
        }
    }

    [HttpPost("stop-recording/{cameraId}")]
    public async Task<IActionResult> StopRecording(string cameraId)
    {
        try
        {
            await _vimbaCameraService.StopRecordingAsync(cameraId);
            return Ok(new { message = "Recording stopped", cameraId });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Failed to stop recording: {ex.Message}" });
        }
    }

    [HttpPost("capture/{cameraId}")]
    public async Task<IActionResult> Capture(string cameraId, [FromQuery] string? machineState = null, [FromQuery] string? notes = null)
    {
        try
        {
            var snapshot = await _vimbaCameraService.CaptureSnapshotAsync(cameraId, machineState, notes);
            return Ok(snapshot);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Error taking snapshot: {ex.Message}" });
        }
    }

    /// <summary>
    /// Sets the fabric movement state for an active recording session.
    /// When isMoving=false the ring buffer freezes — simulates fabric stopped.
    /// When isMoving=true the buffer resumes — simulates fabric moving again.
    /// </summary>
    [HttpPost("fabric-state/{cameraId}")]
    public IActionResult SetFabricState(string cameraId, [FromQuery] bool isMoving)
    {
        try
        {
            _vimbaCameraService.SetFabricState(cameraId, isMoving);
            return Ok(new
            {
                message = isMoving ? "Fabric moving" : "Fabric stopped",
                cameraId,
                fabricIsMoving = isMoving
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Failed to set fabric state: {ex.Message}" });
        }
    }

    /// <summary>
    /// Captures a defect image by looking back in the frame ring buffer.
    /// offsetFrames: explicit frame offset (overrides ruler calculation if both are provided).
    /// rulerPosition: ruler number where the defect was observed; offset is derived from physical distance.
    /// frameCount: frames to stitch into the reconstructed image (±N around center, default: config value).
    /// Fabric MUST be stopped (isMoving=false) before calling this endpoint.
    /// Defect type is recorded per-section via POST /snapshot/{id}/annotations, not at capture time.
    /// </summary>
    [HttpPost("capture-defect/{cameraId}")]
    public async Task<IActionResult> CaptureDefect(
        string cameraId,
        [FromQuery] int? offsetFrames = null,
        [FromQuery] int? frameCount = null,
        [FromQuery] string? machineState = null,
        [FromQuery] string? notes = null,
        [FromQuery] int? rulerPosition = null)
    {
        var settings = _fabricSettings.CurrentValue;

        if (rulerPosition.HasValue && !settings.IsValidPosition(rulerPosition.Value))
            return BadRequest(new
            {
                Message = $"Invalid ruler position '{rulerPosition}'. " +
                          $"Valid range: 1 – {settings.RulerPositionCount}."
            });

        try
        {
            var snapshot = await _vimbaCameraService.CaptureDefectAsync(
                cameraId, offsetFrames, frameCount, machineState, notes, rulerPosition);
            return Ok(snapshot);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Error capturing defect: {ex.Message}" });
        }
    }

    /// <summary>
    /// Serves the stitched PNG image for a captured defect snapshot.
    /// </summary>
    [HttpGet("snapshot-image/{snapshotId:int}")]
    public async Task<IActionResult> GetSnapshotImage(int snapshotId)
    {
        var snapshot = await _repository.GetSnapshotAsync(snapshotId);
        if (snapshot is null)
            return NotFound(new { Message = $"Snapshot {snapshotId} not found." });

        var absolutePath = _storage.GetAbsolutePath(snapshot.FileRelativePath);

        // The service saves both a .bin (raw) and a viewable image (.png name) side-by-side.
        // Prefer the image; fall back to the stored path if somehow only raw exists.
        var pngPath = Path.ChangeExtension(absolutePath, ".png");
        var servePath = System.IO.File.Exists(pngPath) ? pngPath : absolutePath;

        if (!System.IO.File.Exists(servePath))
            return NotFound(new { Message = "Image file not found on disk." });

        // The viewable image may be encoded as JPEG (large stitched captures) or PNG, regardless of the
        // .png file name — detect the real type from the magic bytes so the browser renders it.
        return PhysicalFile(servePath, DetectImageContentType(servePath));
    }

    /// <summary>Detects an image's MIME type from its leading magic bytes (JPEG or PNG).</summary>
    private static string DetectImageContentType(string path)
    {
        try
        {
            Span<byte> head = stackalloc byte[3];
            using var fs = System.IO.File.OpenRead(path);
            if (fs.Read(head) == head.Length)
            {
                if (head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF) return "image/jpeg";
                if (head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E) return "image/png";
            }
        }
        catch { /* fall through to default */ }
        return "image/png";
    }

    /// <summary>
    /// Returns all defect annotations for a snapshot (so the viewer can highlight
    /// already-marked sections when it opens).
    /// </summary>
    [HttpGet("snapshot/{snapshotId:int}/annotations")]
    public async Task<IActionResult> GetAnnotations(int snapshotId)
    {
        var annotations = await _repository.GetAnnotationsBySnapshotAsync(snapshotId);
        return Ok(annotations.Select(a => new
        {
            a.AnnotationId,
            a.SnapshotId,
            a.SectionIndex,
            a.DefectType,
            a.CropImagePath,
            a.CreatedAt,
        }));
    }

    /// <summary>
    /// Creates a defect annotation for a section of the stitched image.
    /// Crops that 1/10 horizontal band from the PNG on disk and saves it.
    /// Idempotent: if the section was already annotated, returns the existing record.
    /// </summary>
    [HttpPost("snapshot/{snapshotId:int}/annotations")]
    public async Task<IActionResult> CreateAnnotation(int snapshotId, [FromBody] CreateAnnotationRequest request)
    {
        var sectionCount = _fabricSettings.CurrentValue.ImageSectionCount;
        if (request.SectionIndex < 1 || request.SectionIndex > sectionCount)
            return BadRequest(new { Message = $"SectionIndex must be between 1 and {sectionCount}." });

        var snapshot = await _repository.GetSnapshotAsync(snapshotId);
        if (snapshot is null)
            return NotFound(new { Message = $"Snapshot {snapshotId} not found." });

        // Check for existing annotation for this section (idempotent)
        var existing = (await _repository.GetAnnotationsBySnapshotAsync(snapshotId))
            .FirstOrDefault(a => a.SectionIndex == request.SectionIndex);
        if (existing is not null)
            return Ok(new { existing.AnnotationId, existing.SnapshotId, existing.SectionIndex, existing.DefectType, existing.CropImagePath, existing.CreatedAt });

        var absolutePath = _storage.GetAbsolutePath(snapshot.FileRelativePath);
        var pngPath = Path.ChangeExtension(absolutePath, ".png");

        if (!System.IO.File.Exists(pngPath))
            return NotFound(new { Message = "Source image PNG not found on disk." });

        var cropPath = await _imageProcessor.CropPngSectionAsync(pngPath, request.SectionIndex, sectionCount, HttpContext.RequestAborted);
        var cropRelative = _storage.GetRelativePath(cropPath);

        var annotation = await _repository.SaveAnnotationAsync(new DefectAnnotation
        {
            SnapshotId = snapshotId,
            SectionIndex = request.SectionIndex,
            DefectType = request.DefectType,
            CropImagePath = cropRelative,
            CreatedAt = DateTime.UtcNow,
        });

        return CreatedAtAction(nameof(GetAnnotations), new { snapshotId },
            new { annotation.AnnotationId, annotation.SnapshotId, annotation.SectionIndex, annotation.DefectType, annotation.CropImagePath, annotation.CreatedAt });
    }

}
