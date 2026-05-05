import { Component, Inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface RulerPositionInfo {
  position: number;
  distanceCm: number;
  framesBack: number;
}

export interface CaptureDefectDialogData {
  cameraName: string;
  rulerPositions: RulerPositionInfo[];
}

export interface CaptureDefectDialogResult {
  rulerPosition: number | null;
  framesBack: number | null;
}

@Component({
  selector: 'app-capture-defect-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <!-- Header -->
    <div class="dialog-header">
      <div class="dialog-header__icon">
        <mat-icon>photo_camera</mat-icon>
      </div>
      <span class="dialog-header__title">Cattura Difetto</span>
      <button class="dialog-close-btn" mat-icon-button (click)="cancel()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div class="dialog-content">

      <!-- Ruler strip -->
      <div class="section">
        <p class="question-label">
          <mat-icon>straighten</mat-icon>
          Tocca la posizione sul righello dove hai visto il difetto
        </p>

        <div class="ruler-grid">
          @for (pos of data.rulerPositions; track pos.position) {
            <button
              type="button"
              class="pos-btn"
              [class.pos-btn--selected]="selectedPosition?.position === pos.position"
              (click)="selectPosition(pos)">
              {{ pos.position }}
            </button>
          }
        </div>

        <!-- Status banner -->
        <div class="status-banner" [class.status-banner--active]="!!selectedPosition">
          <mat-icon>{{ selectedPosition ? 'check_circle' : 'touch_app' }}</mat-icon>
          <span>
            @if (selectedPosition) {
              Posizione <strong>#{{ selectedPosition.position }}</strong> selezionata — pronta per la cattura
            } @else {
              Seleziona una posizione sul righello
            }
          </span>
        </div>
      </div>

    </div>

    <!-- Actions — always visible, no scroll -->
    <mat-dialog-actions class="dialog-actions">
      <button mat-stroked-button class="cancel-btn" (click)="cancel()">
        Annulla
      </button>
      <button mat-raised-button class="capture-btn"
        [disabled]="!selectedPosition"
        (click)="confirm()">
        <mat-icon>photo_camera</mat-icon>
        Cattura
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    /* ── Header ── */
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 20px 14px;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: white;
      border-radius: 4px 4px 0 0;
      flex-shrink: 0;
    }

    .dialog-header__icon {
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.2);
      border-radius: 10px; padding: 6px; flex-shrink: 0;
      mat-icon { font-size: 22px; width: 22px; height: 22px; }
    }

    .dialog-header__title {
      flex: 1;
      font-size: 1.05rem;
      font-weight: 700;
    }

    .dialog-close-btn {
      color: white !important; opacity: 0.8; flex-shrink: 0;
      &:hover { opacity: 1; }
    }

    /* ── Content ── */
    .dialog-content {
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    /* ── Ruler section ── */
    .section {
      padding: 20px 24px 14px;
    }

    .question-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.05rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 16px;

      mat-icon { font-size: 20px; width: 20px; height: 20px; color: #6b7280; }
    }

    /* ── Ruler grid ── */
    .ruler-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .pos-btn {
      height: 72px;
      border: 2px solid #e5e7eb;
      border-radius: 14px;
      background: #f9fafb;
      font-size: 1.4rem;
      font-weight: 700;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.1s, box-shadow 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        border-color: #a5b4fc;
        background: #eef2ff;
        color: #4f46e5;
      }

      &--selected {
        border-color: #4f46e5;
        background: #4f46e5;
        color: white;
        transform: scale(1.06);
        box-shadow: 0 4px 14px rgba(79,70,229,0.4);
      }
    }

    /* ── Status banner ── */
    .status-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 500;
      background: #f9fafb;
      border: 1px dashed #d1d5db;
      color: #9ca3af;
      transition: all 0.2s;

      mat-icon { font-size: 20px; width: 20px; height: 20px; flex-shrink: 0; }
      strong { font-weight: 700; }

      &--active {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #15803d;
        mat-icon { color: #16a34a; }
      }
    }

    /* ── Footer ── */
    .dialog-actions {
      padding: 14px 24px 18px !important;
      border-top: 1px solid #f3f4f6;
      display: flex;
      gap: 12px;
    }

    .cancel-btn {
      height: 56px;
      font-size: 1rem !important;
      min-width: 110px;
    }

    .capture-btn {
      flex: 1;
      height: 56px !important;
      font-size: 1.1rem !important;
      font-weight: 700 !important;
      background-color: #4f46e5 !important;
      color: white !important;
      box-shadow: 0 4px 16px rgba(79,70,229,0.35) !important;
      display: flex; align-items: center; justify-content: center; gap: 8px;

      mat-icon { font-size: 24px; width: 24px; height: 24px; }

      &:disabled {
        background-color: #e5e7eb !important;
        color: #9ca3af !important;
        box-shadow: none !important;
      }
    }
  `],
})
export class CaptureDefectDialogComponent {
  selectedPosition: RulerPositionInfo | null = null;

  constructor(
    private dialogRef: MatDialogRef<CaptureDefectDialogComponent, CaptureDefectDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: CaptureDefectDialogData,
  ) {}

  selectPosition(pos: RulerPositionInfo): void {
    this.selectedPosition = pos;
  }

  confirm(): void {
    if (!this.selectedPosition) return;
    this.dialogRef.close({
      rulerPosition: this.selectedPosition.position,
      framesBack: this.selectedPosition.framesBack,
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
