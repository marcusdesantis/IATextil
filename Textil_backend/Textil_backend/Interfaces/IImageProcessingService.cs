using VmbNET;
using System.Drawing;
using Textil_backend.Services;

namespace Textil_backend.Interfaces;

public interface IImageProcessingService
{
    byte[] ExtractFrameBytes(IFrame frame);

    Task TryWritePngAsync(
        string pngFullPath,
        byte[] bytes,
        uint width,
        uint height,
        IFrame.PixelFormatValue pixelFormat,
        CancellationToken cancellationToken,
        bool asJpeg = false);

    Bitmap? CreateBitmap(byte[] bytes, uint width, uint height, IFrame.PixelFormatValue pixelFormat);

    /// <summary>
    /// Simulates line-scan output by extracting the center row from each frame and stacking
    /// them vertically. The result is a reconstructed fabric image of width × frameCount pixels.
    /// </summary>
    byte[] StitchFrames(IReadOnlyList<FrameEntry> frames, uint frameWidth, uint frameHeight, IFrame.PixelFormatValue pixelFormat);

    /// <summary>
    /// Reconstructs a continuous fabric image by stacking the FULL frames vertically (in buffer
    /// order). Each frame contributes all of its rows, so N frames of H rows produce an image of
    /// width × (N·H) pixels. Only frames matching <paramref name="frameWidth"/>/<paramref name="pixelFormat"/>
    /// are used. <paramref name="totalHeight"/> returns the resulting height in pixels.
    /// </summary>
    byte[] StitchFullFrames(IReadOnlyList<FrameEntry> frames, uint frameWidth, IFrame.PixelFormatValue pixelFormat, out uint totalHeight);

    /// <summary>
    /// Crops a 1/totalSections horizontal band from an existing PNG file and saves it
    /// alongside the source with a "_s{sectionIndex}" suffix.
    /// Returns the absolute path of the saved crop file.
    /// </summary>
    Task<string> CropPngSectionAsync(string sourcePngPath, int sectionIndex, int totalSections = 10, CancellationToken ct = default);
}