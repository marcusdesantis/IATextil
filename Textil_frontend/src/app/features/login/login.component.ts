import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-page">
      <form class="login-card" (ngSubmit)="submit()" #form="ngForm">
        <div class="login-brand">
          <div class="brand-logo"><mat-icon>visibility</mat-icon></div>
          <span class="brand-name">Fratelli Piacenza</span>
          <span class="brand-sub">Sistema di ispezione tessuti</span>
        </div>

        <mat-form-field appearance="outline" class="field">
          <mat-label>Username</mat-label>
          <input matInput name="username" [(ngModel)]="username" autocomplete="username"
                 [disabled]="loading" required #u="ngModel" />
          <mat-icon matPrefix>person</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="field">
          <mat-label>Password</mat-label>
          <input matInput name="password" [type]="hide ? 'password' : 'text'"
                 [(ngModel)]="password" autocomplete="current-password"
                 [disabled]="loading" required />
          <mat-icon matPrefix>lock</mat-icon>
          <button mat-icon-button matSuffix type="button" (click)="hide = !hide"
                  [attr.aria-label]="'Mostra password'">
            <mat-icon>{{ hide ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>

        @if (error) {
          <div class="login-error">
            <mat-icon>error_outline</mat-icon>
            <span>{{ error }}</span>
          </div>
        }

        <button mat-raised-button color="primary" class="login-btn" type="submit"
                [disabled]="loading || form.invalid">
          @if (loading) {
            <mat-spinner diameter="22" />
          } @else {
            <ng-container><mat-icon>login</mat-icon> Accedi</ng-container>
          }
        </button>
      </form>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%);
    }

    .login-card {
      width: 100%;
      max-width: 380px;
      background: #fff;
      border-radius: 18px;
      padding: 36px 32px 32px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .login-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-bottom: 22px;
    }

    .brand-logo {
      width: 56px; height: 56px;
      border-radius: 14px;
      background: #ede9fe;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 6px;
      mat-icon { color: #4f46e5; font-size: 30px; width: 30px; height: 30px; }
    }

    .brand-name { font-size: 1.3rem; font-weight: 700; color: #111827; }
    .brand-sub { font-size: 0.82rem; color: #6b7280; }

    .field { width: 100%; }

    .login-error {
      display: flex; align-items: center; gap: 8px;
      background: #fef2f2; color: #b91c1c;
      border: 1px solid #fecaca; border-radius: 10px;
      padding: 10px 12px; font-size: 0.85rem; margin: 4px 0 8px;
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
    }

    .login-btn {
      height: 48px; font-size: 1rem; margin-top: 8px;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
  `],
})
export class LoginComponent {
  username = '';
  password = '';
  hide = true;
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    if (this.loading) return;
    this.error = '';
    this.loading = true;

    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl(this.auth.homeRoute());
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message ?? 'Errore di accesso. Riprova.';
      },
    });
  }
}
