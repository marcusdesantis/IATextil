using Microsoft.EntityFrameworkCore;

namespace Textil_backend.Models;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<InspectionSnapshot> InspectionSnapshots => Set<InspectionSnapshot>();
    public DbSet<RecordingSessionRecord> RecordingSessions => Set<RecordingSessionRecord>();
    public DbSet<DefectAnnotation> DefectAnnotations => Set<DefectAnnotation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InspectionSnapshot>(entity =>
        {
            entity.ToTable("inspectionsnapshots");
            entity.HasKey(x => x.SnapshotId);

            entity.Property(x => x.SnapshotId).HasColumnName("snapshotid");
            entity.Property(x => x.RecordingId).HasColumnName("recordingid");
            entity.Property(x => x.FileName).HasColumnName("filename").HasMaxLength(255).IsRequired();
            entity.Property(x => x.FileRelativePath).HasColumnName("filerelativepath").HasMaxLength(500).IsRequired();
            entity.Property(x => x.CaptureTimestamp).HasColumnName("capturetimestamp").HasColumnType("timestamp with time zone");
            entity.Property(x => x.CameraFrameId).HasColumnName("cameraframeid");
            entity.Property(x => x.MachineState).HasColumnName("machinestate").HasMaxLength(50);
            entity.Property(x => x.Notes).HasColumnName("notes");
            entity.Property(x => x.DefectType).HasColumnName("defecttype").HasMaxLength(100);
            entity.Property(x => x.RulerPosition).HasColumnName("rulerposition");
            entity.Property(x => x.CalculatedOffsetFrames).HasColumnName("calculatedoffsetframes");

            entity.HasOne(x => x.RecordingSession)
                .WithMany(x => x.Snapshots)
                .HasForeignKey(x => x.RecordingId)
                .HasConstraintName("fk_snapshots_recordings");

            entity.HasIndex(x => x.CaptureTimestamp)
                .HasDatabaseName("ix_inspectionsnapshots_timestamp");

            entity.HasMany<DefectAnnotation>()
                .WithOne(a => a.Snapshot)
                .HasForeignKey(a => a.SnapshotId)
                .HasConstraintName("fk_annotations_snapshots");
        });

        modelBuilder.Entity<DefectAnnotation>(entity =>
        {
            entity.ToTable("defectannotations");
            entity.HasKey(x => x.AnnotationId);

            entity.Property(x => x.AnnotationId).HasColumnName("annotationid");
            entity.Property(x => x.SnapshotId).HasColumnName("snapshotid");
            entity.Property(x => x.SectionIndex).HasColumnName("sectionindex");
            entity.Property(x => x.DefectType).HasColumnName("defecttype").HasMaxLength(100);
            entity.Property(x => x.CropImagePath).HasColumnName("cropimagepath").HasMaxLength(500);
            entity.Property(x => x.CreatedAt).HasColumnName("createdat").HasColumnType("timestamp with time zone");

            entity.HasIndex(x => x.SnapshotId).HasDatabaseName("ix_defectannotations_snapshotid");
        });

        modelBuilder.Entity<RecordingSessionRecord>(entity =>
        {
            entity.ToTable("recordingsessions");
            entity.HasKey(x => x.RecordingId);

            entity.Property(x => x.RecordingId).HasColumnName("recordingid");
            entity.Property(x => x.SessionName).HasColumnName("sessionname").HasMaxLength(255).IsRequired();
            entity.Property(x => x.FilePath).HasColumnName("filepath").HasMaxLength(500).IsRequired();
            entity.Property(x => x.StartTime).HasColumnName("starttime").HasColumnType("timestamp with time zone");
            entity.Property(x => x.EndTime).HasColumnName("endtime").HasColumnType("timestamp with time zone");
            entity.Property(x => x.TotalFrames).HasColumnName("totalframes").HasDefaultValue(0L);
            entity.Property(x => x.InitialFrameId).HasColumnName("initialframeid");
            entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        });
    }
}
