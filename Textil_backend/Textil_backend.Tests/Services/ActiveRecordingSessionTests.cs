using FluentAssertions;
using Textil_backend.Services;
using VmbNET;

namespace Textil_backend.Tests.Services;

public class ActiveRecordingSessionTests
{
    private static FrameEntry MakeFrame(long id, int width = 4, int height = 4) => new()
    {
        FrameId = id,
        Bytes = new byte[width * height],
        Width = (uint)width,
        Height = (uint)height,
        PixelFormat = IFrame.PixelFormatValue.Mono8,
        TimestampUtc = DateTime.UtcNow,
    };

    // ── AddFrame / Buffer ─────────────────────────────────────────────────────

    [Fact]
    public void AddFrame_StoresFrame_WhenFabricIsMoving()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };

        session.AddFrame(MakeFrame(1));

        session.BufferFrameCount.Should().Be(1);
    }

    [Fact]
    public void AddFrame_IgnoresFrame_WhenFabricIsStopped()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };
        session.SetFabricState(false);

        session.AddFrame(MakeFrame(1));

        session.BufferFrameCount.Should().Be(0);
    }

    [Fact]
    public void AddFrame_DropsOldestFrame_WhenBufferIsFull()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 3 };

        session.AddFrame(MakeFrame(1));
        session.AddFrame(MakeFrame(2));
        session.AddFrame(MakeFrame(3));
        session.AddFrame(MakeFrame(4)); // frame 1 should be dropped

        session.BufferFrameCount.Should().Be(3);
        var snapshot = session.GetBufferSnapshot();
        snapshot[0].FrameId.Should().Be(2, because: "oldest frame is evicted when buffer overflows");
        snapshot[2].FrameId.Should().Be(4);
    }

    [Fact]
    public void AddFrame_IncrementsTotalFrames_WhenFabricIsMoving()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };

        session.AddFrame(MakeFrame(1));
        session.AddFrame(MakeFrame(2));

        session.TotalFrames.Should().Be(2);
    }

    [Fact]
    public void AddFrame_DoesNotIncrementTotalFrames_WhenFabricIsStopped()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };
        session.SetFabricState(false);

        session.AddFrame(MakeFrame(1));

        session.TotalFrames.Should().Be(0);
    }

    [Fact]
    public void AddFrame_SetsInitialFrameId_OnFirstFrame()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };

        session.AddFrame(MakeFrame(42));

        session.InitialFrameId.Should().Be(42);
    }

    [Fact]
    public void AddFrame_DoesNotOverwriteInitialFrameId_OnSubsequentFrames()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };

        session.AddFrame(MakeFrame(10));
        session.AddFrame(MakeFrame(20));

        session.InitialFrameId.Should().Be(10);
    }

    // ── SetFabricState ────────────────────────────────────────────────────────

    [Fact]
    public void SetFabricState_ToFalse_SetsIsPaused_WhenRecording()
    {
        var session = new ActiveRecordingSession { IsRecording = true };

        session.SetFabricState(false);

        session.FabricIsMoving.Should().BeFalse();
        session.IsPaused.Should().BeTrue();
    }

    [Fact]
    public void SetFabricState_ToTrue_ResumesFabric()
    {
        var session = new ActiveRecordingSession { IsRecording = true };
        session.SetFabricState(false);

        session.SetFabricState(true);

        session.FabricIsMoving.Should().BeTrue();
        session.IsPaused.Should().BeFalse();
    }

    [Fact]
    public void AddFrame_ResumesStoringFrames_AfterFabricRestarts()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };

        session.AddFrame(MakeFrame(1));
        session.SetFabricState(false);
        session.AddFrame(MakeFrame(2)); // should be ignored
        session.SetFabricState(true);
        session.AddFrame(MakeFrame(3));

        session.BufferFrameCount.Should().Be(2);
        session.GetBufferSnapshot().Select(f => f.FrameId).Should().BeEquivalentTo([1, 3]);
    }

    // ── Empty buffer properties ───────────────────────────────────────────────

    [Fact]
    public void LatestFrameBytes_ReturnsNull_WhenBufferEmpty()
    {
        new ActiveRecordingSession().LatestFrameBytes.Should().BeNull();
    }

    [Fact]
    public void LatestFrameId_ReturnsZero_WhenBufferEmpty()
    {
        new ActiveRecordingSession().LatestFrameId.Should().Be(0);
    }

    [Fact]
    public void LatestFrameWidth_ReturnsZero_WhenBufferEmpty()
    {
        new ActiveRecordingSession().LatestFrameWidth.Should().Be(0u);
    }

    [Fact]
    public void LatestFrameTimestampUtc_ReturnsDefault_WhenBufferEmpty()
    {
        new ActiveRecordingSession().LatestFrameTimestampUtc.Should().Be(default);
    }

    // ── GetBufferSnapshot ─────────────────────────────────────────────────────

    [Fact]
    public void GetBufferSnapshot_ReturnsOrderedOldestToNewest()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 10 };
        session.AddFrame(MakeFrame(1));
        session.AddFrame(MakeFrame(2));
        session.AddFrame(MakeFrame(3));

        var snapshot = session.GetBufferSnapshot();

        snapshot.Should().HaveCount(3);
        snapshot.Select(f => f.FrameId).Should().BeInAscendingOrder();
    }

    [Fact]
    public void GetBufferSnapshot_ReturnsEmptyArray_WhenBufferEmpty()
    {
        new ActiveRecordingSession().GetBufferSnapshot().Should().BeEmpty();
    }

    // ── Thread safety ─────────────────────────────────────────────────────────

    [Fact]
    public async Task AddFrame_IsThreadSafe_UnderConcurrentAccess()
    {
        var session = new ActiveRecordingSession { RingBufferSize = 1000 };

        await Task.WhenAll(Enumerable.Range(1, 100)
            .Select(i => Task.Run(() => session.AddFrame(MakeFrame(i)))));

        session.BufferFrameCount.Should().BeLessThanOrEqualTo(1000);
        session.TotalFrames.Should().Be(100);
    }
}
