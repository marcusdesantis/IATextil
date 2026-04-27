using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Textil_backend.Models;
using Textil_backend.Repositories;

namespace Textil_backend.Tests.Repositories;

public class InspectionRepositoryTests
{
    // Each test gets its own in-memory database (isolated by name)
    private static IServiceScopeFactory BuildScopeFactory(string dbName)
    {
        var services = new ServiceCollection();
        services.AddDbContext<AppDbContext>(opt => opt.UseInMemoryDatabase(dbName));
        return services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
    }

    private static InspectionRepository CreateRepo(string dbName) =>
        new(BuildScopeFactory(dbName));

    // ── RecordingSession ──────────────────────────────────────────────────────

    [Fact]
    public async Task CreateRecordingSessionAsync_ReturnsPositiveId()
    {
        var repo = CreateRepo(nameof(CreateRecordingSessionAsync_ReturnsPositiveId));
        var session = new RecordingSessionRecord
        {
            SessionName = "test-session",
            FilePath = "/captures/test",
            StartTime = DateTime.UtcNow,
            Status = "Active",
        };

        var id = await repo.CreateRecordingSessionAsync(session);

        id.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task UpdateRecordingSessionAsync_ModifiesExistingRecord()
    {
        var db = nameof(UpdateRecordingSessionAsync_ModifiesExistingRecord);
        var repo = CreateRepo(db);
        var session = new RecordingSessionRecord
        {
            SessionName = "session",
            FilePath = "/path",
            StartTime = DateTime.UtcNow,
            Status = "Active",
        };
        var id = await repo.CreateRecordingSessionAsync(session);

        await repo.UpdateRecordingSessionAsync(id, s =>
        {
            s.Status = "Stopped";
            s.EndTime = DateTime.UtcNow;
        });

        using var scope = BuildScopeFactory(db).CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var updated = await ctx.RecordingSessions.FindAsync(id);
        updated!.Status.Should().Be("Stopped");
        updated.EndTime.Should().NotBeNull();
    }

    [Fact]
    public async Task UpdateRecordingSessionAsync_DoesNotThrow_WhenIdNotFound()
    {
        var repo = CreateRepo(nameof(UpdateRecordingSessionAsync_DoesNotThrow_WhenIdNotFound));

        var act = () => repo.UpdateRecordingSessionAsync(9999, s => s.Status = "X");

        await act.Should().NotThrowAsync();
    }

    // ── Snapshot ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveSnapshotAsync_AssignsPositiveSnapshotId()
    {
        var repo = CreateRepo(nameof(SaveSnapshotAsync_AssignsPositiveSnapshotId));
        var snapshot = new InspectionSnapshot
        {
            FileName = "snap.bin",
            FileRelativePath = "captures/snap.bin",
            CaptureTimestamp = DateTime.UtcNow,
        };

        await repo.SaveSnapshotAsync(snapshot);

        snapshot.SnapshotId.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task GetSnapshotAsync_ReturnsNull_ForMissingId()
    {
        var repo = CreateRepo(nameof(GetSnapshotAsync_ReturnsNull_ForMissingId));

        var result = await repo.GetSnapshotAsync(9999);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetSnapshotAsync_ReturnsCorrectSnapshot_ById()
    {
        var repo = CreateRepo(nameof(GetSnapshotAsync_ReturnsCorrectSnapshot_ById));
        var snapshot = new InspectionSnapshot
        {
            FileName = "defect_42.bin",
            FileRelativePath = "captures/defect_42.bin",
            CaptureTimestamp = DateTime.UtcNow,
        };
        await repo.SaveSnapshotAsync(snapshot);

        var result = await repo.GetSnapshotAsync(snapshot.SnapshotId);

        result.Should().NotBeNull();
        result!.FileName.Should().Be("defect_42.bin");
    }

    // ── Annotation ────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveAnnotationAsync_PersistsAnnotation_AndReturnsWithAssignedId()
    {
        var repo = CreateRepo(nameof(SaveAnnotationAsync_PersistsAnnotation_AndReturnsWithAssignedId));
        var snapshot = new InspectionSnapshot
        {
            FileName = "snap.bin",
            FileRelativePath = "captures/snap.bin",
            CaptureTimestamp = DateTime.UtcNow,
        };
        await repo.SaveSnapshotAsync(snapshot);

        var annotation = new DefectAnnotation
        {
            SnapshotId = snapshot.SnapshotId,
            SectionIndex = 3,
            DefectType = "Slub",
            CreatedAt = DateTime.UtcNow,
        };

        var result = await repo.SaveAnnotationAsync(annotation);

        result.AnnotationId.Should().BeGreaterThan(0);
        result.DefectType.Should().Be("Slub");
        result.SectionIndex.Should().Be(3);
    }

    [Fact]
    public async Task GetAnnotationsBySnapshotAsync_ReturnsAnnotationsOrderedBySectionIndex()
    {
        var repo = CreateRepo(nameof(GetAnnotationsBySnapshotAsync_ReturnsAnnotationsOrderedBySectionIndex));
        var snapshot = new InspectionSnapshot
        {
            FileName = "snap.bin",
            FileRelativePath = "captures/snap.bin",
            CaptureTimestamp = DateTime.UtcNow,
        };
        await repo.SaveSnapshotAsync(snapshot);

        await repo.SaveAnnotationAsync(new DefectAnnotation { SnapshotId = snapshot.SnapshotId, SectionIndex = 7, CreatedAt = DateTime.UtcNow });
        await repo.SaveAnnotationAsync(new DefectAnnotation { SnapshotId = snapshot.SnapshotId, SectionIndex = 2, CreatedAt = DateTime.UtcNow });
        await repo.SaveAnnotationAsync(new DefectAnnotation { SnapshotId = snapshot.SnapshotId, SectionIndex = 5, CreatedAt = DateTime.UtcNow });

        var result = await repo.GetAnnotationsBySnapshotAsync(snapshot.SnapshotId);

        result.Select(a => a.SectionIndex).Should().BeInAscendingOrder(
            because: "annotations are always returned ordered by SectionIndex");
    }

    [Fact]
    public async Task GetAnnotationsBySnapshotAsync_ReturnsEmpty_WhenNoAnnotationsExist()
    {
        var repo = CreateRepo(nameof(GetAnnotationsBySnapshotAsync_ReturnsEmpty_WhenNoAnnotationsExist));

        var result = await repo.GetAnnotationsBySnapshotAsync(9999);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAnnotationsBySnapshotAsync_ReturnsOnlyAnnotations_ForGivenSnapshot()
    {
        var repo = CreateRepo(nameof(GetAnnotationsBySnapshotAsync_ReturnsOnlyAnnotations_ForGivenSnapshot));

        var snap1 = new InspectionSnapshot { FileName = "s1.bin", FileRelativePath = "s1.bin", CaptureTimestamp = DateTime.UtcNow };
        var snap2 = new InspectionSnapshot { FileName = "s2.bin", FileRelativePath = "s2.bin", CaptureTimestamp = DateTime.UtcNow };
        await repo.SaveSnapshotAsync(snap1);
        await repo.SaveSnapshotAsync(snap2);

        await repo.SaveAnnotationAsync(new DefectAnnotation { SnapshotId = snap1.SnapshotId, SectionIndex = 1, CreatedAt = DateTime.UtcNow });
        await repo.SaveAnnotationAsync(new DefectAnnotation { SnapshotId = snap2.SnapshotId, SectionIndex = 2, CreatedAt = DateTime.UtcNow });

        var result = await repo.GetAnnotationsBySnapshotAsync(snap1.SnapshotId);

        result.Should().HaveCount(1);
        result[0].SnapshotId.Should().Be(snap1.SnapshotId);
    }
}
