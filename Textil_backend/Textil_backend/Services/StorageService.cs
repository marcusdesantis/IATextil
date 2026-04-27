using Textil_backend.Interfaces;

namespace Textil_backend.Services;

public class StorageService : IStorageService
{
    private readonly IWebHostEnvironment _environment;

    public StorageService(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    private string RootPath => _environment.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");

    public string GetCaptureFolder(string cameraId, DateTime timestamp)
    {
        return Path.Combine(RootPath, "captures", Sanitize(cameraId), timestamp.ToString("yyyyMMdd_HHmmss"));
    }

    public string GetSnapshotFolder(string cameraId)
    {
        var now = DateTime.UtcNow;
        return Path.Combine(RootPath, "captures", Sanitize(cameraId), "snapshots",
                            now.ToString("yyyy"), now.ToString("MM"), now.ToString("dd"));
    }

    public string GenerateFileName(string prefix, long frameId, string extension = ".bin")
    {
        return $"{prefix}_{DateTime.UtcNow:yyyyMMdd_HHmmss_fff}_{frameId}{extension}";
    }

    public void EnsureDirectoryExists(string path)
    {
        if (!Directory.Exists(path))
            Directory.CreateDirectory(path);
    }

    public string GetRelativePath(string absolutePath)
    {
        return Path.GetRelativePath(RootPath, absolutePath).Replace("\\", "/");
    }

    public string GetAbsolutePath(string relativePath)
    {
        return Path.GetFullPath(Path.Combine(RootPath, relativePath));
    }

    public string Sanitize(string value)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
            value = value.Replace(c, '_');
        return value.Trim();
    }
}