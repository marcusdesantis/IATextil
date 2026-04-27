namespace Textil_backend.Models;

public class DefectAnnotation
{
    public int AnnotationId { get; set; }
    public int SnapshotId { get; set; }
    public int SectionIndex { get; set; }       // 1–10
    public string? DefectType { get; set; }     // defect category label
    public string? CropImagePath { get; set; }  // relative path to the saved crop PNG
    public DateTime CreatedAt { get; set; }

    public InspectionSnapshot? Snapshot { get; set; }
}
