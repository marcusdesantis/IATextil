using VmbNET;

namespace Textil_backend.Services;

public sealed class FrameEntry
{
    public long FrameId { get; init; }
    public byte[] Bytes { get; init; } = null!;
    public uint Width { get; init; }
    public uint Height { get; init; }
    public IFrame.PixelFormatValue PixelFormat { get; init; }
    public DateTime TimestampUtc { get; init; }
}

public class ActiveRecordingSession : IDisposable
{
    private readonly Queue<FrameEntry> _frameBuffer = new();
    private readonly object _bufferLock = new();

    public string CameraId { get; set; } = null!;
    public IOpenCamera OpenCamera { get; set; } = null!;
    public IAcquisition Acquisition { get; set; } = null!;
    public string OutputFolder { get; set; } = null!;
    public bool IsRecording { get; set; }
    public int RecordingId { get; set; }
    public string SessionName { get; set; } = null!;
    public DateTime StartedAtUtc { get; set; }
    public int RingBufferSize { get; set; } = 500;

    // Fabric movement simulation state
    public bool FabricIsMoving { get; private set; } = true;

    /// <summary>True when the session is active but the fabric is stopped (acquisition paused).</summary>
    public bool IsPaused => IsRecording && !FabricIsMoving;

    // Frame counters (total frames received from camera, regardless of state)
    public long TotalFrames { get; private set; }
    public long InitialFrameId { get; private set; }

    // How many frames are in the ring buffer
    public int BufferFrameCount
    {
        get { lock (_bufferLock) return _frameBuffer.Count; }
    }

    // Latest frame properties (from last entry in buffer, for backwards compatibility)
    public byte[]? LatestFrameBytes
    {
        get { lock (_bufferLock) return _frameBuffer.Count > 0 ? _frameBuffer.Last().Bytes : null; }
    }
    public long LatestFrameId
    {
        get { lock (_bufferLock) return _frameBuffer.Count > 0 ? _frameBuffer.Last().FrameId : 0; }
    }
    public DateTime LatestFrameTimestampUtc
    {
        get { lock (_bufferLock) return _frameBuffer.Count > 0 ? _frameBuffer.Last().TimestampUtc : default; }
    }
    public uint LatestFrameWidth
    {
        get { lock (_bufferLock) return _frameBuffer.Count > 0 ? _frameBuffer.Last().Width : 0; }
    }
    public uint LatestFrameHeight
    {
        get { lock (_bufferLock) return _frameBuffer.Count > 0 ? _frameBuffer.Last().Height : 0; }
    }
    public IFrame.PixelFormatValue LatestPixelFormat
    {
        get { lock (_bufferLock) return _frameBuffer.Count > 0 ? _frameBuffer.Last().PixelFormat : default; }
    }

    /// <summary>
    /// Adds a frame to the ring buffer. Only stores the frame when FabricIsMoving is true.
    /// Drops the oldest frame if the buffer is full.
    /// </summary>
    public void AddFrame(FrameEntry entry)
    {
        // Only process frames while fabric is moving — mirrors encoder-trigger behavior
        if (!FabricIsMoving) return;

        if (InitialFrameId == 0)
            InitialFrameId = entry.FrameId;

        TotalFrames++;

        lock (_bufferLock)
        {
            if (_frameBuffer.Count >= RingBufferSize)
                _frameBuffer.Dequeue();

            _frameBuffer.Enqueue(entry);
        }
    }

    /// <summary>
    /// Changes the fabric movement state. When stopped, no new frames are added to the buffer.
    /// </summary>
    public void SetFabricState(bool isMoving)
    {
        FabricIsMoving = isMoving;
    }

    /// <summary>
    /// Returns a snapshot of the buffer as an ordered array (oldest → newest).
    /// </summary>
    public FrameEntry[] GetBufferSnapshot()
    {
        lock (_bufferLock)
            return _frameBuffer.ToArray();
    }

    public void Dispose()
    {
        try { Acquisition?.Dispose(); } catch { }
        try { OpenCamera?.Dispose(); } catch { }
    }
}
