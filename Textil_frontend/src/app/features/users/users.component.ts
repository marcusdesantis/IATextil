import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { ManagedUser } from '../../core/models/user.models';
import {
  UserFormDialogComponent,
  UserFormDialogData,
  UserFormDialogResult,
} from './user-form-dialog.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Gestione utenti</h1>
          <span class="page-subtitle">Crea e gestisci operatori e amministratori</span>
        </div>
        <div class="header-actions">
          <a mat-stroked-button routerLink="/operator" class="back-btn">
            <mat-icon>arrow_back</mat-icon>
            Torna all'ispezione
          </a>
          <button mat-raised-button color="primary" (click)="openCreate()">
            <mat-icon>person_add</mat-icon>
            Nuovo utente
          </button>
        </div>
      </div>

      <div class="section-card">
        @if (loading()) {
          <div class="state-row"><mat-spinner diameter="36" /></div>
        } @else if (users().length === 0) {
          <div class="state-row state-row--empty">Nessun utente.</div>
        } @else {
          <table class="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Nome</th>
                <th>Ruolo</th>
                <th>Stato</th>
                <th class="col-actions">Azioni</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.userId) {
                <tr>
                  <td class="cell-username">
                    <mat-icon class="role-icon">{{ u.role === 'Administrator' ? 'shield_person' : 'badge' }}</mat-icon>
                    {{ u.username }}
                    @if (u.userId === currentUserId) { <span class="you-badge">tu</span> }
                  </td>
                  <td>{{ u.displayName || '—' }}</td>
                  <td>
                    <span class="role-chip" [class.role-chip--admin]="u.role === 'Administrator'">
                      {{ u.role === 'Administrator' ? 'Amministratore' : 'Operatore' }}
                    </span>
                  </td>
                  <td>
                    <span class="status-dot" [class.status-dot--off]="!u.isActive"></span>
                    {{ u.isActive ? 'Attivo' : 'Disattivato' }}
                  </td>
                  <td class="col-actions">
                    <button mat-icon-button (click)="openEdit(u)" matTooltip="Modifica">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button color="warn" (click)="remove(u)"
                            [disabled]="u.userId === currentUserId" matTooltip="Elimina">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 28px 32px; max-width: 960px; margin: 0 auto; }
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; margin-bottom: 24px; flex-wrap: wrap;
    }
    .page-title { font-size: 1.6rem; font-weight: 700; color: #111827; margin: 0; }
    .page-subtitle { font-size: 0.875rem; color: #6b7280; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

    .section-card {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
      overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }

    .state-row { display: flex; justify-content: center; padding: 40px; color: #9ca3af; }
    .state-row--empty { font-size: 0.9rem; }

    .users-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .users-table th {
      text-align: left; font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.05em; color: #9ca3af; font-weight: 700;
      padding: 14px 18px; border-bottom: 1px solid #f3f4f6;
    }
    .users-table td { padding: 14px 18px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    .users-table tr:last-child td { border-bottom: none; }

    .cell-username { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #111827; }
    .role-icon { font-size: 20px; width: 20px; height: 20px; color: #6b7280; }
    .you-badge {
      font-size: 0.65rem; font-weight: 700; background: #ede9fe; color: #5b21b6;
      padding: 1px 7px; border-radius: 20px;
    }

    .role-chip {
      font-size: 0.72rem; font-weight: 600; background: #f3f4f6; color: #6b7280;
      padding: 3px 10px; border-radius: 20px;
      &--admin { background: #fef3c7; color: #92400e; }
    }

    .status-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; margin-right: 6px; vertical-align: middle;
      &--off { background: #d1d5db; }
    }

    .col-actions { text-align: right; white-space: nowrap; }
  `],
})
export class UsersComponent implements OnInit {
  users = signal<ManagedUser[]>([]);
  loading = signal(true);
  currentUserId: number;

  constructor(
    private usersService: UsersService,
    private auth: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.currentUserId = this.auth.user()?.userId ?? 0;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.usersService.getAll().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast('Errore nel caricamento degli utenti.');
      },
    });
  }

  openCreate(): void {
    const ref = this.dialog.open(UserFormDialogComponent, {
      data: { user: null } as UserFormDialogData,
      autoFocus: false,
    });
    ref.afterClosed().subscribe((result: UserFormDialogResult | undefined) => {
      if (!result) return;
      this.usersService.create({
        username: result.username,
        password: result.password ?? '',
        role: result.role,
        displayName: result.displayName,
      }).subscribe({
        next: () => { this.toast('Utente creato.'); this.load(); },
        error: (err) => this.toast(err?.error?.message ?? 'Errore nella creazione.'),
      });
    });
  }

  openEdit(user: ManagedUser): void {
    const ref = this.dialog.open(UserFormDialogComponent, {
      data: { user } as UserFormDialogData,
      autoFocus: false,
    });
    ref.afterClosed().subscribe((result: UserFormDialogResult | undefined) => {
      if (!result) return;
      this.usersService.update(user.userId, {
        password: result.password ?? null,
        role: result.role,
        displayName: result.displayName,
        isActive: result.isActive,
      }).subscribe({
        next: () => { this.toast('Utente aggiornato.'); this.load(); },
        error: (err) => this.toast(err?.error?.message ?? 'Errore di aggiornamento.'),
      });
    });
  }

  remove(user: ManagedUser): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminare utente',
        message: `Vuoi eliminare l'utente "${user.username}"? L'operazione e' definitiva.`,
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        danger: true,
        icon: 'delete',
      } as ConfirmDialogData,
      autoFocus: false,
      width: '420px',
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.usersService.delete(user.userId).subscribe({
        next: () => { this.toast('Utente eliminato.'); this.load(); },
        error: (err) => this.toast(err?.error?.message ?? 'Errore di eliminazione.'),
      });
    });
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Chiudi', {
      duration: 3500,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}
