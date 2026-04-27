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
}