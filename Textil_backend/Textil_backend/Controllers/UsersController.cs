using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Textil_backend.Models;

namespace Textil_backend.Controllers;

public record CreateUserRequest(string Username, string Password, string Role, string? DisplayName);
public record UpdateUserRequest(string? Password, string? Role, string? DisplayName, bool? IsActive);

[Route("api/[controller]")]
[ApiController]
[Authorize(Roles = UserRoles.Administrator)]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher<User> _hasher;
    private readonly ILogger<UsersController> _logger;

    public UsersController(AppDbContext db, IPasswordHasher<User> hasher, ILogger<UsersController> logger)
    {
        _db = db;
        _hasher = hasher;
        _logger = logger;
    }

    private int CurrentUserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    private static UserDto ToDto(User u) =>
        new(u.UserId, u.Username, u.Role, u.DisplayName, u.IsActive);

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var users = await _db.Users
            .OrderBy(u => u.Username)
            .Select(u => ToDto(u))
            .ToListAsync();
        return Ok(users);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Username e password sono obbligatori." });

        if (!UserRoles.IsValid(request.Role))
            return BadRequest(new { message = "Ruolo non valido." });

        var exists = await _db.Users.AnyAsync(u => u.Username == request.Username);
        if (exists)
            return Conflict(new { message = "Esiste già un utente con questo username." });

        var user = new User
        {
            Username = request.Username.Trim(),
            Role = request.Role,
            DisplayName = request.DisplayName,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };
        user.PasswordHash = _hasher.HashPassword(user, request.Password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        _logger.LogInformation("Created user '{Username}' ({Role}).", user.Username, user.Role);

        return CreatedAtAction(nameof(GetAll), new { id = user.UserId }, ToDto(user));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserRequest request)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null)
            return NotFound();

        // Guard: don't allow demoting or deactivating the last active administrator.
        var demotingAdmin = user.Role == UserRoles.Administrator &&
            ((request.Role is not null && request.Role != UserRoles.Administrator) ||
             (request.IsActive == false));
        if (demotingAdmin)
        {
            var otherActiveAdmins = await _db.Users.CountAsync(u =>
                u.UserId != id && u.Role == UserRoles.Administrator && u.IsActive);
            if (otherActiveAdmins == 0)
                return BadRequest(new { message = "Deve esistere almeno un amministratore attivo." });
        }

        if (request.Role is not null)
        {
            if (!UserRoles.IsValid(request.Role))
                return BadRequest(new { message = "Ruolo non valido." });
            user.Role = request.Role;
        }

        if (request.DisplayName is not null)
            user.DisplayName = request.DisplayName;

        if (request.IsActive is not null)
            user.IsActive = request.IsActive.Value;

        if (!string.IsNullOrWhiteSpace(request.Password))
            user.PasswordHash = _hasher.HashPassword(user, request.Password);

        await _db.SaveChangesAsync();
        _logger.LogInformation("Updated user '{Username}'.", user.Username);

        return Ok(ToDto(user));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null)
            return NotFound();

        if (user.UserId == CurrentUserId)
            return BadRequest(new { message = "Non puoi eliminare il tuo stesso account." });

        if (user.Role == UserRoles.Administrator)
        {
            var otherActiveAdmins = await _db.Users.CountAsync(u =>
                u.UserId != id && u.Role == UserRoles.Administrator && u.IsActive);
            if (otherActiveAdmins == 0)
                return BadRequest(new { message = "Deve esistere almeno un amministratore attivo." });
        }

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        _logger.LogInformation("Deleted user '{Username}'.", user.Username);

        return NoContent();
    }
}
