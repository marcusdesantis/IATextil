using Microsoft.EntityFrameworkCore;
using Textil_backend.Interfaces;
using Textil_backend.Models;

namespace Textil_backend.Repositories;

public class InspectionRepository : IInspectionRepository
{
    private readonly IServiceScopeFactory _scopeFactory;

    public InspectionRepository(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<int> CreateRecordingSessionAsync(RecordingSessionRecord session)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.RecordingSessions.Add(session);
        await db.SaveChangesAsync();

        return session.RecordingId;
    }

    public async Task UpdateRecordingSessionAsync(int recordingId, Action<RecordingSessionRecord> updateAction)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var entity = await db.RecordingSessions.FindAsync(recordingId);
        if (entity != null)
        {
            updateAction(entity);
            await db.SaveChangesAsync();
        }
    }

    public async Task SaveSnapshotAsync(InspectionSnapshot snapshot)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.InspectionSnapshots.Add(snapshot);
        await db.SaveChangesAsync();
    }

    public async Task<InspectionSnapshot?> GetSnapshotAsync(int snapshotId)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return await db.InspectionSnapshots.FindAsync(snapshotId);
    }

    public async Task<DefectAnnotation> SaveAnnotationAsync(DefectAnnotation annotation)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.DefectAnnotations.Add(annotation);
        await db.SaveChangesAsync();
        return annotation;
    }

    public async Task<IReadOnlyList<DefectAnnotation>> GetAnnotationsBySnapshotAsync(int snapshotId)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return await db.DefectAnnotations
            .Where(a => a.SnapshotId == snapshotId)
            .OrderBy(a => a.SectionIndex)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<DefectTypeCount>> GetDefectStatisticsAsync(DateTime? fromUtc, DateTime? toUtc)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var query = db.DefectAnnotations.AsQueryable();
        if (fromUtc.HasValue)
            query = query.Where(a => a.CreatedAt >= fromUtc.Value);
        if (toUtc.HasValue)
            query = query.Where(a => a.CreatedAt < toUtc.Value);

        return await query
            .GroupBy(a => a.DefectType)
            .Select(g => new DefectTypeCount { DefectType = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync();
    }
}