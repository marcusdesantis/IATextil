export type UserRole = 'Administrator' | 'Operator';

/** Authenticated user as carried in the app session. */
export interface AuthUser {
  userId: number;
  username: string;
  role: UserRole;
  displayName?: string | null;
  isActive: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresInMinutes: number;
  user: AuthUser;
}

/** A user as managed from the admin screen (same shape as AuthUser). */
export interface ManagedUser extends AuthUser {}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: UserRole;
  displayName?: string | null;
}

export interface UpdateUserRequest {
  password?: string | null;
  role?: UserRole;
  displayName?: string | null;
  isActive?: boolean;
}
