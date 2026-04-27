using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using NSubstitute;
using Textil_backend.Services;

namespace Textil_backend.Tests.Services;

public class StorageServiceTests
{
    private static StorageService Create(string root = @"C:\test\root")
    {
        var env = Substitute.For<IWebHostEnvironment>();
        env.WebRootPath.Returns(root);
        return new StorageService(env);
    }

    // ── Sanitize ──────────────────────────────────────────────────────────────

    [Fact]
    public void Sanitize_ReplacesInvalidFileNameChars_WithUnderscore()
    {
        var result = Create().Sanitize("cam/id:with?invalid*chars");

        result.Should().NotContainAny(
            Path.GetInvalidFileNameChars().Select(c => c.ToString()),
            because: "sanitized names must be safe to use as folder/file names");
    }

    [Fact]
    public void Sanitize_ReturnsSameValue_ForCleanInput()
    {
        Create().Sanitize("DEV_001").Should().Be("DEV_001");
    }

    [Fact]
    public void Sanitize_TrimsLeadingAndTrailingWhitespace()
    {
        Create().Sanitize("  CAM  ").Should().Be("CAM");
    }

    // ── GetRelativePath ───────────────────────────────────────────────────────

    [Fact]
    public void GetRelativePath_NormalizesBackslashes_ToForwardSlashes()
    {
        var svc = Create(@"C:\test\root");
        var abs = @"C:\test\root\captures\DEV_001\file.bin";

        var result = svc.GetRelativePath(abs);

        result.Should().NotContain(@"\",
            because: "relative paths must use forward slashes for HTTP URL compatibility");
        result.Should().Be("captures/DEV_001/file.bin");
    }

    // ── GetAbsolutePath ───────────────────────────────────────────────────────

    [Fact]
    public void GetAbsolutePath_JoinsRootWithRelativePath()
    {
        var svc = Create(@"C:\test\root");

        var result = svc.GetAbsolutePath("captures/DEV_001/file.bin");

        result.Should().StartWith(@"C:\test\root");
        result.Should().Contain("DEV_001");
    }

    [Fact]
    public void GetAbsolutePath_RoundTrips_WithGetRelativePath()
    {
        var svc = Create(@"C:\test\root");
        var original = @"C:\test\root\captures\cam\snap.bin";

        var relative = svc.GetRelativePath(original);
        var restored = svc.GetAbsolutePath(relative);

        Path.GetFullPath(restored).Should().Be(Path.GetFullPath(original));
    }

    // ── GetCaptureFolder ──────────────────────────────────────────────────────

    [Fact]
    public void GetCaptureFolder_ContainsCameraId_AndFormattedTimestamp()
    {
        var ts = new DateTime(2026, 4, 24, 10, 30, 0, DateTimeKind.Utc);

        var folder = Create().GetCaptureFolder("DEV_001", ts);

        folder.Should().Contain("DEV_001");
        folder.Should().Contain("20260424_103000");
    }

    [Fact]
    public void GetCaptureFolder_SanitizesCameraId_BeforeUsingAsPathSegment()
    {
        var folder = Create().GetCaptureFolder("cam/bad:id", DateTime.UtcNow);

        // After sanitization "/" and ":" become "_", so the segment should be safe
        folder.Should().NotContain("cam/bad:id");
    }

    // ── GetSnapshotFolder ─────────────────────────────────────────────────────

    [Fact]
    public void GetSnapshotFolder_IncludesYearMonthDay_AsNestedSubfolders()
    {
        var folder = Create().GetSnapshotFolder("DEV_001");
        var now = DateTime.UtcNow;

        folder.Should().Contain(now.ToString("yyyy"));
        folder.Should().Contain(now.ToString("MM"));
        folder.Should().Contain(now.ToString("dd"));
    }

    // ── GenerateFileName ──────────────────────────────────────────────────────

    [Fact]
    public void GenerateFileName_StartsWithPrefix_ContainsFrameId_EndsWithExtension()
    {
        var name = Create().GenerateFileName("snapshot", 9999L, ".png");

        name.Should().StartWith("snapshot_");
        name.Should().Contain("9999");
        name.Should().EndWith(".png");
    }

    [Fact]
    public void GenerateFileName_DefaultExtension_IsBin()
    {
        var name = Create().GenerateFileName("frame", 1L);

        name.Should().EndWith(".bin");
    }
}
