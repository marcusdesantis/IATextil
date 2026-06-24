using Textil_backend.Models;

namespace Textil_backend.Interfaces;

public interface IInspectionRepository
{
    Task<int> CreateRecordingSessionAsync(RecordingSessionRecord session);
    Task UpdateRecordingSessionAsync(int recordingId, Action<RecordingSessionRecord> updateAction);
    Task SaveSnapshotAsync(InspectionSnapshot snapshot);
    Task<InspectionSnapshot?> GetSnapshotAsync(int snapshotId);
    Task<DefectAnnotation> SaveAnnotationAsync(DefectAnnotation annotation);
    Task<IReadOnlyList<DefectAnnotation>> GetAnnotationsBySnapshotAsync(int snapshotId);

    /// <summary>
    /// Returns the count of captured defects grouped by defect type, optionally
    /// restricted to annotations created within [fromUtc, toUtc). Both bounds are
    /// optional; pass null to leave that side of the range open.
    /// </summary>
    Task<IReadOnlyList<DefectTypeCount>> GetDefectStatisticsAsync(DateTime? fromUtc, DateTime? toUtc);
}