using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Textil_backend.Services;
using VmbNET;

namespace Textil_backend.Tests.Services;

public class ImageProcessingServiceTests
{
    private readonly ImageProcessingService _svc =
        new(NullLogger<ImageProcessingService>.Instance);

    private static FrameEntry MakeEntry(int width, int height, IFrame.PixelFormatValue fmt, byte fill = 128)
    {
        int bpp = fmt switch
        {
            IFrame.PixelFormatValue.Mono8 => 1,
            IFrame.PixelFormatValue.BGR8 or IFrame.PixelFormatValue.RGB8 => 3,
            IFrame.PixelFormatValue.BGRa8 or IFrame.PixelFormatValue.RGBa8 => 4,
            _ => 3,
        };
        return new FrameEntry
        {
            FrameId = 1,
            Width = (uint)width,
            Height = (uint)height,
            PixelFormat = fmt,
            Bytes = Enumerable.Repeat(fill, width * height * bpp).ToArray(),
            TimestampUtc = DateTime.UtcNow,
        };
    }

    // ── StitchFrames: edge cases ──────────────────────────────────────────────

    [Fact]
    public void StitchFrames_ReturnsEmpty_ForEmptyFrameList()
    {
        _svc.StitchFrames([], 100, 100, IFrame.PixelFormatValue.Mono8).Should().BeEmpty();
    }

    [Fact]
    public void StitchFrames_ReturnsEmpty_WhenWidthIsZero()
    {
        var frame = MakeEntry(4, 4, IFrame.PixelFormatValue.Mono8);
        _svc.StitchFrames([frame], 0, 4, IFrame.PixelFormatValue.Mono8).Should().BeEmpty();
    }

    [Fact]
    public void StitchFrames_ReturnsEmpty_WhenHeightIsZero()
    {
        var frame = MakeEntry(4, 4, IFrame.PixelFormatValue.Mono8);
        _svc.StitchFrames([frame], 4, 0, IFrame.PixelFormatValue.Mono8).Should().BeEmpty();
    }

    // ── StitchFrames: output size per pixel format ────────────────────────────

    [Theory]
    [InlineData(IFrame.PixelFormatValue.Mono8, 1)]
    [InlineData(IFrame.PixelFormatValue.RGB8, 3)]
    [InlineData(IFrame.PixelFormatValue.BGR8, 3)]
    [InlineData(IFrame.PixelFormatValue.BGRa8, 4)]
    [InlineData(IFrame.PixelFormatValue.RGBa8, 4)]
    public void StitchFrames_OutputLength_Equals_FrameCount_Times_Width_Times_Bpp(
        IFrame.PixelFormatValue fmt, int bpp)
    {
        int width = 8, height = 6, frameCount = 5;
        var frames = Enumerable.Range(0, frameCount)
            .Select(_ => MakeEntry(width, height, fmt))
            .ToList();

        var result = _svc.StitchFrames(frames, (uint)width, (uint)height, fmt);

        result.Should().HaveCount(frameCount * width * bpp);
    }

    // ── StitchFrames: center row extraction ──────────────────────────────────

    [Fact]
    public void StitchFrames_ExtractsCenterRow_NotFirstOrLastRow()
    {
        int width = 4, height = 6;
        // Each row has a distinct byte value: row 0 → 0x00, row 1 → 0x11 … row 5 → 0x55
        var bytes = new byte[width * height];
        for (int row = 0; row < height; row++)
            for (int col = 0; col < width; col++)
                bytes[row * width + col] = (byte)(row * 0x11);

        var entry = new FrameEntry
        {
            FrameId = 1,
            Width = (uint)width,
            Height = (uint)height,
            PixelFormat = IFrame.PixelFormatValue.Mono8,
            Bytes = bytes,
            TimestampUtc = DateTime.UtcNow,
        };

        var result = _svc.StitchFrames([entry], (uint)width, (uint)height, IFrame.PixelFormatValue.Mono8);

        // centerRow = height / 2 = 3  →  expected value = 3 * 0x11 = 0x33
        result.Should().HaveCount(width);
        result.All(b => b == 0x33).Should().BeTrue(
            because: "StitchFrames must extract center row (index 3) from each frame");
    }

    // ── StitchFrames: malformed / undersized frames ───────────────────────────

    [Fact]
    public void StitchFrames_FillsZeros_ForMalformedFrames()
    {
        int width = 4, height = 4;
        var malformed = new FrameEntry
        {
            FrameId = 1,
            Width = (uint)width,
            Height = (uint)height,
            PixelFormat = IFrame.PixelFormatValue.Mono8,
            Bytes = new byte[1], // too small — center row won't fit
            TimestampUtc = DateTime.UtcNow,
        };

        var result = _svc.StitchFrames([malformed], (uint)width, (uint)height, IFrame.PixelFormatValue.Mono8);

        result.Should().HaveCount(width);
        result.All(b => b == 0).Should().BeTrue(
            because: "malformed frames must produce a black (zero) row rather than throwing");
    }

    // ── CreateBitmap: null / empty guard ─────────────────────────────────────

    [Fact]
    public void CreateBitmap_ReturnsNull_WhenWidthIsZero()
    {
        _svc.CreateBitmap(new byte[100], 0, 10, IFrame.PixelFormatValue.Mono8).Should().BeNull();
    }

    [Fact]
    public void CreateBitmap_ReturnsNull_WhenHeightIsZero()
    {
        _svc.CreateBitmap(new byte[100], 10, 0, IFrame.PixelFormatValue.Mono8).Should().BeNull();
    }

    [Fact]
    public void CreateBitmap_ReturnsNull_WhenBytesEmpty()
    {
        _svc.CreateBitmap([], 4, 4, IFrame.PixelFormatValue.Mono8).Should().BeNull();
    }

    [Fact]
    public void CreateBitmap_ReturnsNull_ForUnknownPixelFormat()
    {
        _svc.CreateBitmap(new byte[400], 10, 10, (IFrame.PixelFormatValue)9999).Should().BeNull();
    }

    // ── CreateBitmap: dimensions per pixel format ─────────────────────────────

    [Theory]
    [InlineData(IFrame.PixelFormatValue.Mono8, 1)]
    [InlineData(IFrame.PixelFormatValue.RGB8, 3)]
    [InlineData(IFrame.PixelFormatValue.BGR8, 3)]
    [InlineData(IFrame.PixelFormatValue.BGRa8, 4)]
    [InlineData(IFrame.PixelFormatValue.RGBa8, 4)]
    public void CreateBitmap_ReturnsBitmapWithCorrectDimensions(
        IFrame.PixelFormatValue fmt, int bpp)
    {
        var bytes = new byte[4 * 4 * bpp];
        using var bitmap = _svc.CreateBitmap(bytes, 4, 4, fmt);

        bitmap.Should().NotBeNull();
        bitmap!.Width.Should().Be(4);
        bitmap.Height.Should().Be(4);
    }
}
