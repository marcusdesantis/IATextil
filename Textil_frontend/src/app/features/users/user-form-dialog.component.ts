import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { ManagedUser, UserRole } from '../../core/models/user.models';

export interface UserFormDialogData {
  /** Existing user when editing; null when creating. */
  user: ManagedUser | null;
}

export interface UserFormDialogResult {
  username: string;
  password?: string;
  role: UserRole;
  displayName?: string | null;
  isActive: boolean;
}

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <div class="dialog-header">
      <div class="dialog-header__icon"><mat-icon>{{ isEdit ? 'manage_accounts' : 'person_add' }}</mat-icon></div>
      <span class="dialog-header__title">{{ isEdit ? 'Modifica utente' : 'Nuovo utente' }}</span>
      <button class="dialog-close-btn" mat-icon-button (click)="cancel()"><mat-icon>close</mat-icon></button>
    </div>

    <form class="dialog-content" (ngSubmit)="save()" #form="ngForm">
      <mat-form-field appearance="outline" class="field">
        <mat-label>Username</mat-label>
        <input matInput name="username" [(ngModel)]="username" [disabled]="isEdit"
               required minlength="3" pattern="^[a-zA-Z0-9._-]+$" #usernameModel="ngModel" />
        @if (usernameModel.hasError('required')) {
          <mat-error>Lo username è obbligatorio.</mat-error>
        } @else if (usernameModel.hasError('minlength')) {
          <mat-error>Minimo 3 caratteri.</mat-error>
        } @else if (usernameModel.hasError('pattern')) {
          <mat-error>Solo lettere, numeri e . _ - (senza spazi).</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="field">
        <mat-label>Nome visualizzato</mat-label>
        <input matInput name="displayName" [(ngModel)]="displayName"
               minlength="3" #displayNameModel="ngModel" />
        @if (displayNameModel.hasError('minlength')) {
          <mat-error>Minimo 3 caratteri.</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="field">
        <mat-label>Ruolo</mat-label>
        <mat-select name="role" [(ngModel)]="role" required>
          <mat-option value="Operator">Operatore</mat-option>
          <mat-option value="Administrator">Amministratore</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="field">
        <mat-label>{{ isEdit ? 'Nuova password (lascia vuoto per non cambiare)' : 'Password' }}</mat-label>
        <input matInput name="password" type="password" [(ngModel)]="password"
               [required]="!isEdit" minlength="6" autocomplete="new-password" #passwordModel="ngModel" />
        @if (passwordModel.hasError('required')) {
          <mat-error>La password è obbligatoria.</mat-error>
        } @else if (passwordModel.hasError('minlength')) {
          <mat-error>Minimo 6 caratteri.</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="field">
        <mat-label>Conferma password</mat-label>
        <input matInput name="confirmPassword" type="password" [(ngModel)]="confirmPassword"
               [required]="!isEdit || !!password" autocomplete="new-password" />
      </mat-form-field>

      @if (passwordMismatch) {
        <div class="form-error">
          <mat-icon>error_outline</mat-icon>
          <span>Le password non coincidono.</span>
        </div>
      }

      @if (isEdit) {
        <mat-slide-toggle name="isActive" [(ngModel)]="isActive" color="primary">
          Utente attivo
        </mat-slide-toggle>
      }

      <div class="dialog-actions">
        <button mat-stroked-button type="button" (click)="cancel()">Annulla</button>
        <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || passwordMismatch">
          <mat-icon>save</mat-icon> Salva
        </button>
      </div>
    </form>
  `,
  styles: [`
    .dialog-header {
      display: flex; align-items: center; gap: 12px;
      padding: 18px 20px; border-bottom: 1px solid #eef0f3;
    }
    .dialog-header__icon {
      width: 38px; height: 38px; border-radius: 10px;
      background: #ede9fe; display: flex; align-items: center; justify-content: center;
      mat-icon { color: #4f46e5; }
    }
    .dialog-header__title { font-size: 1.05rem; font-weight: 700; color: #111827; flex: 1; }
    .dialog-close-btn { color: #9ca3af; }

    .dialog-content {
      padding: 20px; display: flex; flex-direction: column; gap: 6px;
      min-width: 340px;
    }
    .field { width: 100%; }

    .form-error {
      display: flex; align-items: center; gap: 8px;
      background: #fef2f2; color: #b91c1c;
      border: 1px solid #fecaca; border-radius: 10px;
      padding: 8px 12px; font-size: 0.82rem; margin: -2px 0 4px;
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }

    .dialog-actions {
      display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px;
    }
  `],
})
export class UserFormDialogComponent {
  isEdit: boolean;
  username = '';
  displayName: string | null = '';
  role: UserRole = 'Operator';
  password = '';
  confirmPassword = '';
  isActive = true;

  /** True when both password fields have content that doesn't match. */
  get passwordMismatch(): boolean {
    return (this.password ?? '') !== (this.confirmPassword ?? '');
  }

  constructor(
    private dialogRef: MatDialogRef<UserFormDialogComponent, UserFormDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: UserFormDialogData,
  ) {
    this.isEdit = !!data.user;
    if (data.user) {
      this.username = data.user.username;
      this.displayName = data.user.displayName ?? '';
      this.role = data.user.role;
      this.isActive = data.user.isActive;
    }
  }

  save(): void {
    if (this.passwordMismatch) return;
    this.dialogRef.close({
      username: this.username.trim(),
      password: this.password ? this.password : undefined,
      role: this.role,
      displayName: this.displayName?.trim() || null,
      isActive: this.isActive,
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
