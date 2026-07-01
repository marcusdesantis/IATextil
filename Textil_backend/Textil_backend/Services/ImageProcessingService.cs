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
        // VmbNET exposes two pointers: Buffer (raw buffer start) and ImageData (image start =
        // Buffer + chunk size). Prefer the actual image data; fall back to the raw buffer.
        var ptr = frame.ImageData != IntPtr.Zero ? frame.ImageData : frame.Buffer;
        if (ptr == IntPtr.Zero || frame.BufferSize == 0)
            return Array.Empty<byte>();

        var bytes = new byte[checked((int)frame.BufferSize)];
        Marshal.Copy(ptr, bytes, 0, bytes.Length);
        return bytes;
    }

    public async Task TryWritePngAsync(
        string pngFullPath,
        byte[] bytes,
        uint width,
        uint height,
        IFrame.PixelFormatValue pixelFormat,
        CancellationToken cancellationToken,
        bool asJpeg = false)
    {
        try
        {
            await Task.Run(() =>
            {
                using var bitmap = CreateBitmap(bytes, width, height, pixelFormat);
                if (bitmap == null) return;

                // The line-scan image comes in tall/portrait (width = across the fabric, height = along
                // travel). Rotate 90° so the long axis (travel) is horizontal — easier to view and the
                // zone bands become wider. The crop divides the rotated image's height (= fabric width).
                // To flip the rotation direction, use Rotate270FlipNone instead.
                // NOTE: rotation disabled on request — the frames are already stored in landscape
                // orientation, so rotating would turn them sideways.
                // bitmap.RotateFlip(RotateFlipType.Rotate90FlipNone);

                // When many full frames are stitched (e.g. tall simulator frames × a large "per lato"),
                // the composite can exceed GDI+'s encoder limits and Image.Save fails with a generic
                // GDI+ error, leaving a 0-byte PNG. Downscale proportionally so the longest side fits a
                // safe maximum — the image stays viewable and the vertical zone bands remain selectable.
                const int MaxSide = 20000;
                var longest = Math.Max(bitmap.Width, bitmap.Height);
                if (longest > MaxSide)
                {
                    var scale = (double)MaxSide / longest;
                    var newWidth = Math.Max(1, (int)(bitmap.Width * scale));
                    var newHeight = Math.Max(1, (int)(bitmap.Height * scale));
                    using var scaled = new Bitmap(bitmap, new Size(newWidth, newHeight));
                    SaveBitmap(scaled, pngFullPath, asJpeg);
                    _logger.LogWarning(
                        "Stitched image {W}x{H} exceeded the {Max}px limit; downscaled to {NW}x{NH}.",
                        bitmap.Width, bitmap.Height, MaxSide, newWidth, newHeight);
                    return;
                }

                SaveBitmap(bitmap, pngFullPath, asJpeg);
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate PNG for snapshot. PixelFormat: {PixelFormat}", pixelFormat);
        }
    }

    // JPEG encoder, resolved once. Fabric is photographic and stitched defect images can be huge;
    // PNG (lossless) blows them up to tens of MB and the browser <img> fails to load them, while a
    // JPEG of the same image is a few MB. PNG is kept for single frames / diagnostics.
    private static readonly ImageCodecInfo? _jpegCodec =
        ImageCodecInfo.GetImageEncoders().FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);

    private static void SaveBitmap(Bitmap bitmap, string path, bool asJpeg)
    {
        if (asJpeg && _jpegCodec != null)
        {
            using var ep = new EncoderParameters(1);
            ep.Param[0] = new EncoderParameter(Encoder.Quality, 88L);
            bitmap.Save(path, _jpegCodec, ep);
        }
        else
        {
            bitmap.Save(path, ImageFormat.Png);
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
            var w = bitmap.Width;

            for (var y = 0; y < bitmap.Height; y++)
            {
                var rowIndex = y * stride;
                for (var x = 0; x < w; x++)
                {
                    // Compute source index per pixel so a short/partial buffer can't overrun:
                    // packed RGB source has 3 bytes per pixel, no row padding.
                    var srcIndex = (y * w + x) * 3;
                    if (srcIndex + 2 >= bytes.Length)
                    {
                        // Source ran out (incomplete frame) — leave the rest of the image black
                        // instead of throwing, so we still produce a (partial) PNG.
                        Marshal.Copy(dstBytes, 0, data.Scan0, dstBytes.Length);
                        return bitmap;
                    }

                    var c1 = bytes[srcIndex];
                    var c2 = bytes[srcIndex + 1];
                    var c3 = bytes[srcIndex + 2];
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
    /// Crops zone {sectionIndex} of {totalSections} from the (rotated, landscape) PNG on disk and
    /// saves it as {baseName}_s{sectionIndex}.png in the same directory. Zones are VERTICAL columns
    /// selected left→right (split by width), matching the on-screen left-to-right zone selection.
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

    /// <summary>
    /// Reconstructs a continuous fabric image by stacking the FULL frames vertically (in buffer
    /// order). Unlike <see cref="StitchFrames"/> (one center row per frame — correct for a true
    /// 1-line line-scan), this keeps every row of each frame, so consecutive area-scan strips are
    /// concatenated into one tall image. N frames of H rows → width × (N·H) pixels.
    /// </summary>
    public byte[] StitchFullFrames(IReadOnlyList<FrameEntry> frames, uint frameWidth, IFrame.PixelFormatValue pixelFormat, out uint totalHeight)
    {
        totalHeight = 0;
        if (frames.Count == 0 || frameWidth == 0)
            return Array.Empty<byte>();

        int bytesPerPixel = pixelFormat switch
        {
            IFrame.PixelFormatValue.Mono8 => 1,
            IFrame.PixelFormatValue.BGR8 or IFrame.PixelFormatValue.RGB8 => 3,
            IFrame.PixelFormatValue.BGRa8 or IFrame.PixelFormatValue.RGBa8 => 4,
            _ => 3
        };

        var rowBytes = (int)frameWidth * bytesPerPixel;
        if (rowBytes == 0)
            return Array.Empty<byte>();

        // Only stitch frames whose width/format match the reference, so rows line up. Count whole
        // rows only (a partial trailing row from a malformed frame is dropped).
        var usable = frames
            .Where(f => f.Width == frameWidth && f.PixelFormat == pixelFormat && f.Bytes.Length >= rowBytes)
            .ToList();
        if (usable.Count == 0)
            return Array.Empty<byte>();

        long totalBytes = 0;
        foreach (var f in usable)
            totalBytes += (f.Bytes.Length / rowBytes) * (long)rowBytes;

        var result = new byte[totalBytes];
        var dst = 0;
        var rowCount = 0;
        foreach (var f in usable)
        {
            var rows = f.Bytes.Length / rowBytes;
            var copyLen = rows * rowBytes;
            Buffer.BlockCopy(f.Bytes, 0, result, dst, copyLen);
            dst += copyLen;
            rowCount += rows;
        }

        totalHeight = (uint)rowCount;
        return result;
    }
}