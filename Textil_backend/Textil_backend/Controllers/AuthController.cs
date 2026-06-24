using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textil_backend.Models;
using Textil_backend.Services;

namespace Textil_backend.Controllers;

public record LoginRequest(string Username, string Password);
public record UserDto(int UserId, string Username, string Role, string? DisplayName, bool IsActive);
public record LoginResponse(string Token, int ExpiresInMinutes, UserDto User);

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher<User> _hasher;
    private readonly TokenService _tokenService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        AppDbContext db,
        IPasswordHasher<User> hasher,
        TokenService tokenService,
        ILogger<AuthController> logger)
    {
        _db = db;
        _hasher = hasher;
        _tokenService = tokenService;
        _logger = logger;
    }

    /// <summary>Validates credentials and returns a signed JWT plus the user's profile.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Username e password sono obbligatori." });

        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Username == request.Username);

        // Same response whether the user is missing or the password is wrong (avoid user enumeration).
        if (user is null || !user.IsActive)
            return Unauthorized(new { message = "Credenziali non valide." });

        var verification = _hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "Credenziali non valide." });

        // Transparently upgrade legacy/weak hashes on successful login.
        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = _hasher.HashPassword(user, request.Password);
            await _db.SaveChangesAsync();
        }

        var token = _tokenService.CreateToken(user);
        _logger.LogInformation("User '{Username}' logged in.", user.Username);

        return Ok(new LoginResponse(
            token,
            _tokenService.ExpiryMinutes,
            new UserDto(user.UserId, user.Username, user.Role, user.DisplayName, user.IsActive)));
    }

    /// <summary>Returns the profile of the currently authenticated user.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(idClaim, out var userId))
            return Unauthorized();

        var user = await _db.Users.FindAsync(userId);
        if (user is null || !user.IsActive)
            return Unauthorized();

        return Ok(new UserDto(user.UserId, user.Username, user.Role, user.DisplayName, user.IsActive));
    }
}
