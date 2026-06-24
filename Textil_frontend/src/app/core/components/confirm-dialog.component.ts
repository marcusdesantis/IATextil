import { Component, Inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** When true, the confirm button is styled as a destructive (red) action. */
  danger?: boolean;
  /** Material icon name shown in the header. */
  icon?: string;
}

/**
 * Generic, app-styled confirmation dialog. Returns `true` when confirmed,
 * `undefined`/`false` otherwise. Replaces the native window.confirm().
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirm">
      <div class="confirm__icon" [class.confirm__icon--danger]="data.danger">
        <mat-icon>{{ data.icon ?? (data.danger ? 'warning' : 'help_outline') }}</mat-icon>
      </div>
      <h2 class="confirm__title">{{ data.title }}</h2>
      <p class="confirm__message">{{ data.message }}</p>

      <div class="confirm__actions">
        <button mat-stroked-button (click)="cancel()">
          {{ data.cancelText ?? 'Annulla' }}
        </button>
        <button mat-raised-button
                [color]="data.danger ? 'warn' : 'primary'"
                (click)="confirm()" cdkFocusInitial>
          {{ data.confirmText ?? 'Conferma' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirm {
      padding: 26px 26px 20px;
      max-width: 380px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .confirm__icon {
      width: 56px; height: 56px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: #eef2ff; margin-bottom: 4px;
      mat-icon { color: #4f46e5; font-size: 30px; width: 30px; height: 30px; }

      &--danger {
        background: #fef2f2;
        mat-icon { color: #dc2626; }
      }
    }
    .confirm__title { font-size: 1.15rem; font-weight: 700; color: #111827; margin: 0; }
    .confirm__message { font-size: 0.9rem; color: #6b7280; margin: 0; line-height: 1.5; }
    .confirm__actions {
      display: flex; gap: 10px; margin-top: 16px; width: 100%;
      button { flex: 1; min-height: 44px; }
    }
  `],
})
export class ConfirmDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
  ) {}

  confirm(): void { this.dialogRef.close(true); }
  cancel(): void { this.dialogRef.close(false); }
}
