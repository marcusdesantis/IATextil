namespace Textil_backend.Models;

/// <summary>
/// Aggregated count of captured defects for a single defect type,
/// used by the statistics dashboard.
/// </summary>
public class DefectTypeCount
{
    public string? DefectType { get; set; }
    public int Count { get; set; }
}
