using System.ComponentModel.DataAnnotations.Schema;

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

    // Stitch/composition info — describes how the defect image was built. Transient (not persisted):
    // populated only on the response returned right after a capture, so the viewer can show it.
    [NotMapped] public int? StitchedFrameCount { get; set; }
    [NotMapped] public int? FramesBack { get; set; }
    [NotMapped] public int? FramesForward { get; set; }
    [NotMapped] public int? StitchedWidth { get; set; }
    [NotMapped] public int? StitchedHeight { get; set; }
    [NotMapped] public int? BufferFrameCount { get; set; }
    [NotMapped] public long? FirstFrameId { get; set; }
    [NotMapped] public long? LastFrameId { get; set; }

    public RecordingSessionRecord? RecordingSession { get; set; }
}
