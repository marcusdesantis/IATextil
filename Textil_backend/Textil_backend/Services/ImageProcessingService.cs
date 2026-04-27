using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Textil_backend.Interfaces;
using VmbNET;
using Textil_backend.Services;

namespace Textil_backend.Services;

public class ImageProcessingService : IImageProcessingService
{
    private readonly ILogger<ImageProcessingService> _logger;

    public ImageProcessingService(ILogger<ImageProcessingService> logger)
    {
        _logger = logger;
    }

    public byte[] ExtractFrameBytes(IFrame frame)
    {
        if (frame.Buffer == IntPtr.Zero || frame.BufferSize == 0)
            return Array.Empty<byte>();

        var bytes = new byte[checked((int)frame.BufferSize)];
        Marshal.Copy(frame.Buffer, bytes, 0, bytes.Length);
        return bytes;
    }

    public async Task TryWritePngAsync(
        string pngFullPath,
        byte[] bytes,
        uint width,
        uint height,
        IFrame.PixelFormatValue pixelFormat,
        CancellationToken cancellationToken)
    {
        try
        {
            await Task.Run(() =>
            {
                using var bitmap = CreateBitmap(bytes, width, height, pixelFormat);
                if (bitmap == null) return;

                bitmap.Save(pngFullPath, ImageFormat.Png);
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate PNG for snapshot. PixelFormat: {PixelFormat}", pixelFormat);
        }
    }

    public Bitmap? CreateBitmap(byte[] bytes, uint width, uint height, IFrame.PixelFormatValue pixelFormat)
    {
        if (width == 0 || height == 0 || bytes.Length == 0) return null;

        return pixelFormat switch
        {
            IFrame.PixelFormatValue.Mono8 => CreateMono8Bitmap(bytes, width, height),
            IFrame.PixelFormatValue.BGR8 => CreateRgbBitmap(bytes, width, height, isBgr: true),
            IFrame.PixelFormatValue.RGB8 => CreateRgbBitmap(bytes, width, height, isBgr: false),
            IFrame.PixelFormatValue.BGRa8 => CreateBgraBitmap(bytes, width, height),
            IFrame.PixelFormatValue.RGBa8 => CreateRgbaBitmap(bytes, width, height),
            _ => null
        };
    }

    private Bitmap CreateMono8Bitmap(byte[] bytes, uint width, uint height)
    {
        var bitmap = new Bitmap((int)width, (int)height, PixelFormat.Format24bppRgb);
        var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rect, ImageLockMode.WriteOnly, bitmap.PixelFormat);

        try
        {
            var stride = data.Stride;
            var rgbBytes = new byte[stride * bitmap.Height];
            var srcIndex = 0;

            for (var y = 0; y < bitmap.Height; y++)
            {
                var rowIndex = y * stride;
                for (var x = 0; x < bitmap.Width; x++)
                {
                    var value = bytes[srcIndex++];
                    var pixelIndex = rowIndex + (x * 3);
                    rgbBytes[pixelIndex] = value;
                    rgbBytes[pixelIndex + 1] = value;
                    rgbBytes[pixelIndex + 2] = value;
                }
            }
            Marshal.Copy(rgbBytes, 0, data.Scan0, rgbBytes.Length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
        return bitmap;
    }

    private Bitmap CreateRgbBitmap(byte[] bytes, uint width, uint height, bool isBgr)
    {
        var bitmap = new Bitmap((int)width, (int)height, PixelFormat.Format24bppRgb);
        var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rect, ImageLockMode.WriteOnly, bitmap.PixelFormat);

        try
        {
            var stride = data.Stride;
            var dstBytes = new byte[stride * bitmap.Height];
            var srcIndex = 0;

            for (var y = 0; y < bitmap.Height; y++)
            {
                var rowIndex = y * stride;
                for (var x = 0; x < bitmap.Width; x++)
                {
                    var c1 = bytes[srcIndex++];
                    var c2 = bytes[srcIndex++];
                    var c3 = bytes[srcIndex++];
                    var pixelIndex = rowIndex + (x * 3);

                    if (isBgr)
                    {
                        dstBytes[pixelIndex] = c1;
                        dstBytes[pixelIndex + 1] = c2;
                        dstBytes[pixelIndex + 2] = c3;
                    }
                    else
                    {
                        dstBytes[pixelIndex] = c3;
                        dstBytes[pixelIndex + 1] = c2;
                        dstBytes[pixelIndex + 2] = c1;
                    }
                }
            }
            Marshal.Copy(dstBytes, 0, data.Scan0, dstBytes.Length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
        return bitmap;
    }

    private Bitmap CreateBgraBitmap(byte[] bytes, uint width, uint height)
    {
        var bitmap = new Bitmap((int)width, (int)height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(rect, ImageLockMode.WriteOnly, bitmap.PixelFormat);

        try
        {
            var byteCount = Math.Min(bytes.Length, Math.Abs(data.Stride) * bitmap.Height);
            Marshal.Copy(bytes, 0, data.Scan0, byteCount);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
        return bitmap;
    }

    private Bitmap CreateRgbaBitmap(byte[] bytes, uint width, uint height)
    {
        var converted = new byte[bytes.Length];
        for (var i = 0; i + 3 < bytes.Length; i += 4)
        {
            converted[i] = bytes[i + 2];
            converted[i + 1] = bytes[i + 1];
            converted[i + 2] = bytes[i];
            converted[i + 3] = bytes[i + 3];
        }
        return CreateBgraBitmap(converted, width, height);
    }

    /// <summary>
    /// Crops a 1/totalSections horizontal band from a PNG on disk and saves the result
    /// as {baseName}_s{sectionIndex}.png in the same directory.
    /// Returns the absolute path of the saved crop.
    /// </summary>
    public async Task<string> CropPngSectionAsync(
        string sourcePngPath,
        int sectionIndex,
        int totalSections = 10,
        CancellationToken ct = default)
    {
        var dir = Path.GetDirectoryName(sourcePngPath)!;
        var baseName = Path.GetFileNameWithoutExtension(sourcePngPath);
        var cropPath = Path.Combine(dir, $"{baseName}_s{sectionIndex}.png");

        await Task.Run(() =>
        {
            using var source = new Bitmap(sourcePngPath);

            var sectionWidth = source.Width / totalSections;
            var x = (sectionIndex - 1) * sectionWidth;

            // Last section absorbs any rounding remainder
            if (sectionIndex == totalSections)
                sectionWidth = source.Width - x;

            var srcRect = new Rectangle(x, 0, sectionWidth, source.Height);
            using var crop = source.Clone(srcRect, source.PixelFormat);
            crop.Save(cropPath, ImageFormat.Png);
        }, ct);

        return cropPath;
    }

    /// <summary>
    /// Simulates line-scan camera output. For each frame, extracts the center row
    /// (1 horizontal line of pixels) and stacks all rows vertically to produce a
    /// reconstructed fabric image of dimensions: width × frames.Count pixels.
    ///
    /// This matches the behavior of the AllPixa neo 6k (line-scan), where each frame
    /// IS a single line. With the demo area-scan camera we approximate this by sampling
    /// one representative line per frame.
    /// </summary>
    public byte[] StitchFrames(IReadOnlyList<FrameEntry> frames, uint frameWidth, uint frameHeight, IFrame.PixelFormatValue pixelFormat)
    {
        if (frames.Count == 0 || frameWidth == 0 || frameHeight == 0)
            return Array.Empty<byte>();

        int bytesPerPixel = pixelFormat switch
        {
            IFrame.PixelFormatValue.Mono8 => 1,
            IFrame.PixelFormatValue.BGR8 or IFrame.PixelFormatValue.RGB8 => 3,
            IFrame.PixelFormatValue.BGRa8 or IFrame.PixelFormatValue.RGBa8 => 4,
            _ => 3
        };

        var width = (int)frameWidth;
        var rowBytes = width * bytesPerPixel;
        var centerRow = (int)(frameHeight / 2);

        // Output: one row per frame, stacked vertically
        var result = new byte[frames.Count * rowBytes];

        for (var i = 0; i < frames.Count; i++)
        {
            var src = frames[i].Bytes;
            var srcOffset = centerRow * rowBytes;

            // Guard against frames with unexpected sizes
            if (src.Length < srcOffset + rowBytes)
            {
                // Fill with zeros (black line) for malformed frames

                continue;
            }
              
            Buffer.BlockCopy(src, srcOffset, result, i * rowBytes, rowBytes);
        }

        return result;
    }
}