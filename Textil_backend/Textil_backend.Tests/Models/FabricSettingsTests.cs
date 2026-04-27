using FluentAssertions;
using Textil_backend.Models;

namespace Textil_backend.Tests.Models;

/// <summary>
/// Pure unit tests for FabricSettings ruler geometry calculations.
/// No I/O, no DI — just the math.
///
/// Physical layout:
///   Camera ──── 50 cm ────┤ ruler start
///                          [1][2][3]...[12]   (5 cm each)
///   Position center: distance_cm = 50 + (position - 0.5) × 5
/// </summary>
public class FabricSettingsTests
{
    private static FabricSettings Default() => new()
    {
        RulerBaseDistanceCm = 50.0,
        RulerPositionCount = 12,
        RulerPositionSpacingCm = 5.0,
        CmPerFrame = 0.4   // 10 cm/s at 25 fps
    };

    // ── GetDistanceCm ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData(1,  52.5)]
    [InlineData(2,  57.5)]
    [InlineData(3,  62.5)]
    [InlineData(6,  77.5)]
    [InlineData(12, 107.5)]
    public void GetDistanceCm_ReturnsCorrectCenterDistance(int position, double expectedCm)
    {
        var settings = Default();
        settings.GetDistanceCm(position).Should().BeApproximately(expectedCm, precision: 0.001);
    }

    // ── GetFramesBack ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData(1,  131)]   // 52.5 / 0.4 = 131.25 → 131
    [InlineData(2,  144)]   // 57.5 / 0.4 = 143.75 → 144
    [InlineData(6,  194)]   // 77.5 / 0.4 = 193.75 → 194
    [InlineData(12, 269)]   // 107.5 / 0.4 = 268.75 → 269
    public void GetFramesBack_ReturnsRoundedFrameCount(int position, int expectedFrames)
    {
        var settings = Default();
        settings.GetFramesBack(position).Should().Be(expectedFrames);
    }

    [Fact]
    public void GetFramesBack_IncludesBaseDistance_NotJustPosition()
    {
        var settings = Default();

        // Position 1 must include the 50 cm base gap.
        // Wrong (old) logic: 1 × 10mm / 0.1mm = 100 frames.
        // Correct logic: 52.5 cm / 0.4 cm/frame ≈ 131 frames.
        settings.GetFramesBack(1).Should().BeGreaterThan(100,
            because: "the 50 cm base gap must be included in the calculation");
    }

    [Fact]
    public void GetFramesBack_IncreasesMonotonically()
    {
        var settings = Default();

        var frames = Enumerable.Range(1, 12)
            .Select(p => settings.GetFramesBack(p))
            .ToList();

        frames.Should().BeInAscendingOrder(
            because: "each successive ruler position is farther from the camera");
    }

    // ── IsValidPosition ───────────────────────────────────────────────────────

    [Theory]
    [InlineData(1,  true)]
    [InlineData(6,  true)]
    [InlineData(12, true)]
    [InlineData(0,  false)]
    [InlineData(13, false)]
    [InlineData(-1, false)]
    public void IsValidPosition_AcceptsOnlyOneToTwelve(int position, bool expected)
    {
        Default().IsValidPosition(position).Should().Be(expected);
    }

    // ── Custom calibration ────────────────────────────────────────────────────

    [Fact]
    public void GetFramesBack_ScalesWithCmPerFrame()
    {
        var slow = Default();   // 0.4 cm/frame
        var fast = Default();
        fast.CmPerFrame = 0.1;  // finer resolution → more frames

        slow.GetFramesBack(6).Should().BeLessThan(fast.GetFramesBack(6),
            because: "smaller cm/frame means more frames are needed to cover the same distance");
    }
}
