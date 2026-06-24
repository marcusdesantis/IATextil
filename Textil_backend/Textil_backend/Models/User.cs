namespace Textil_backend.Models;

/// <summary>Application user. Authenticates via username + hashed password and carries a role.</summary>
public class User
{
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = UserRoles.Operator;   // see <see cref="UserRoles"/>
    public string? DisplayName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

/// <summary>The two roles the system recognizes. Stored verbatim in the JWT "role" claim.</summary>
public static class UserRoles
{
    public const string Administrator = "Administrator";
    public const string Operator = "Operator";

    public static bool IsValid(string? role) =>
        role == Administrator || role == Operator;
}
