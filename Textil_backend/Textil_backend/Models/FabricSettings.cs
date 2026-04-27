namespace Textil_backend.Models;

/// <summary>
/// Configuration for fabric simulation, ring-buffer behaviour, and the physical ruler system.
///
/// Physical ruler layout (all distances measured from the camera):
///
///   Camera
///     |-------- 50 cm base gap --------|-- ruler start
///     |                                |---[1]---[2]---[3]-...-[12]---|
///     |                                50cm                           110cm
///
///   Each of the 12 positions occupies 5 cm.
///   The effective (center) distance for position P is:
///
///       distance_cm = RulerBaseDistanceCm + (P - 0.5) × RulerPositionSpacingCm
///
///   Examples:
///       Position  1 → 50 + 0.5 × 5 =  52.5 cm
///       Position  6 → 50 + 5.5 × 5 =  77.5 cm
///       Position 12 → 50 + 11.5 × 5 = 107.5 cm
///
///   Frames back = distance_cm / CmPerFrame
///   CmPerFrame must be calibrated to the actual fabric speed and camera frame rate.
///   (Typical: CmPerFrame = FabricSpeedCmPerSec / FramesPerSec)
/// </summary>
public class FabricSettings
{
    // ---- Ring buffer ----
    public int RingBufferSize { get; set; } = 500;
    public int DefaultOffsetFrames { get; set; } = 100;
    public int DefaultFrameCount { get; set; } = 20;
    public List<string> DefectTypes { get; set; } = [];

    // ---- Image section viewer ----

    /// <summary>
    /// Number of horizontal sections the stitched defect image is divided into
    /// in the web viewer. Operators click a section to annotate and crop it.
    /// </summary>
    public int ImageSectionCount { get; set; } = 10;

    // ---- Ruler physical geometry ----

    /// <summary>Distance (cm) from the camera to the physical start of the ruler.</summary>
    public double RulerBaseDistanceCm { get; set; } = 50.0;

    /// <summary>Number of fixed positions on the ruler (positions 1..RulerPositionCount).</summary>
    public int RulerPositionCount { get; set; } = 12;

    /// <summary>Physical length (cm) occupied by each ruler position.</summary>
    public double RulerPositionSpacingCm { get; set; } = 5.0;

    // ---- Frame calibration ----

    /// <summary>
    /// Centimetres of fabric that pass under the camera per frame.
    /// Must be calibrated: CmPerFrame = FabricSpeedCmPerSec / CameraFps
    /// Example at 10 cm/s and 25 fps  →  0.40 cm/frame
    /// Example at 10 m/min and 8000 fps (AllPixa) → 0.00208 cm/frame
    /// </summary>
    public double CmPerFrame { get; set; } = 0.4;

    // ---- Derived helpers (not stored in appsettings) ----

    /// <summary>
    /// Returns the center distance (cm) from the camera for the given 1-based ruler position.
    /// Formula: RulerBaseDistanceCm + (position - 0.5) × RulerPositionSpacingCm
    /// </summary>
    public double GetDistanceCm(int position) =>
        RulerBaseDistanceCm + (position - 0.5) * RulerPositionSpacingCm;

    /// <summary>
    /// Returns the number of frames to go back in the buffer for the given ruler position.
    /// </summary>
    public int GetFramesBack(int position) =>
        (int)Math.Round(GetDistanceCm(position) / CmPerFrame);

    /// <summary>Validates that position is in [1, RulerPositionCount].</summary>
    public bool IsValidPosition(int position) =>
        position >= 1 && position <= RulerPositionCount;
}
