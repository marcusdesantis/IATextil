import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser, LoginResponse, UserRole } from '../models/user.models';

const TOKEN_KEY = 'iatextil_token';
const USER_KEY = 'iatextil_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/auth`;

  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly _user = signal<AuthUser | null>(this.readStoredUser());

  /** Current JWT (or null). Read synchronously by the HTTP interceptor. */
  readonly token = this._token.asReadonly();
  /** Current authenticated user (or null). */
  readonly user = this._user.asReadonly();

  readonly isAuthenticated = computed(() => this._token() !== null && this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'Administrator');
  readonly isOperator = computed(() => this._user()?.role === 'Operator');

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, { username, password })
      .pipe(tap((res) => this.setSession(res.token, res.user)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
  }

  /** Route a user should land on after login, based on their role. */
  homeRoute(role: UserRole | undefined = this._user()?.role): string {
    return role === 'Administrator' ? '/dashboard' : '/operator';
  }

  private setSession(token: string, user: AuthUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this._token.set(token);
    this._user.set(user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
