namespace Textil_backend.Models;

public class RecordingSessionRecord
{
    public int RecordingId { get; set; }
    public string SessionName { get; set; } = null!;
    public string FilePath { get; set; } = null!;
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public long TotalFrames { get; set; }
    public long InitialFrameId { get; set; }
    public string Status { get; set; } = null!;

    public ICollection<InspectionSnapshot> Snapshots { get; set; } = new List<InspectionSnapshot>();
}
