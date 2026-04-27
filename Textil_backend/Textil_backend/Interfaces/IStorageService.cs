namespace Textil_backend.Interfaces;

public interface IStorageService
{
    string GetCaptureFolder(string cameraId, DateTime timestamp);
    string GetSnapshotFolder(string cameraId);
    string GetRelativePath(string absolutePath);
    string GetAbsolutePath(string relativePath);
    string GenerateFileName(string prefix, long frameId, string extension = ".bin");
    void EnsureDirectoryExists(string path);
    string Sanitize(string value);
}
