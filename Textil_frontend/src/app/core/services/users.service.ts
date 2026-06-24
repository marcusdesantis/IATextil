import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CreateUserRequest, ManagedUser, UpdateUserRequest } from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/users`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(this.baseUrl);
  }

  create(request: CreateUserRequest): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(this.baseUrl, request);
  }

  update(userId: number, request: UpdateUserRequest): Observable<ManagedUser> {
    return this.http.put<ManagedUser>(`${this.baseUrl}/${userId}`, request);
  }

  delete(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}`);
  }
}
