namespace Textil_backend.Models;

public class InspectionSnapshot
{
    public int SnapshotId { get; set; }
    public int? RecordingId { get; set; }
    public string FileName { get; set; } = null!;
    public string FileRelativePath { get; set; } = null!;
    public DateTime CaptureTimestamp { get; set; }
    public long CameraFrameId { get; set; }
    public string? MachineState { get; set; }
    public string? Notes { get; set; }

    // Ruler-based defect location
    public string? DefectType { get; set; }
    public int? RulerPosition { get; set; }
    public int? CalculatedOffsetFrames { get; set; }

    public RecordingSessionRecord? RecordingSession { get; set; }
}
