import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

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
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  template: `
    <!-- Header -->
    <div class="dialog-header">
      <div class="dialog-header__icon">
        <mat-icon>search</mat-icon>
      </div>
      <div class="dialog-header__text">
        <span class="dialog-header__title">Capture Defect</span>
        <span class="dialog-header__camera">{{ data.cameraName }}</span>
      </div>
      <button class="dialog-close-btn" mat-icon-button (click)="cancel()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="dialog-content">

      <!-- Section: Ruler position -->
      <div class="section">
        <div class="section-label">
          <span>Ruler position</span>
          <span class="required-badge">Required</span>
        </div>
        <p class="section-hint">Tap the number that matches the mark on the physical ruler.</p>

        <div class="ruler-grid">
          @for (pos of data.rulerPositions; track pos.position) {
            <button type="button"
              class="ruler-btn"
              [class.ruler-btn--selected]="selectedPosition?.position === pos.position"
              (click)="selectPosition(pos)"
              [matTooltip]="pos.distanceCm + ' cm · ' + pos.framesBack + ' frames back'"
              matTooltipPosition="above">
              {{ pos.position }}
            </button>
          }
        </div>

        <!-- Info banner -->
        @if (selectedPosition) {
          <div class="info-banner info-banner--active">
            <mat-icon>straighten</mat-icon>
            <div>
              <div class="info-banner__main">
                Position <strong>#{{ selectedPosition.position }}</strong>
                &nbsp;·&nbsp;
                <strong>{{ selectedPosition.framesBack }} frames back</strong>
              </div>
              <div class="info-banner__sub">{{ selectedPosition.distanceCm }} cm from the camera</div>
            </div>
          </div>
        } @else {
          <div class="info-banner info-banner--idle">
            <mat-icon>touch_app</mat-icon>
            <span>Select a ruler position to calculate the frame offset.</span>
          </div>
        }
      </div>

    </mat-dialog-content>

    <!-- Actions -->
    <mat-dialog-actions class="dialog-actions">
      <button mat-stroked-button class="action-btn action-btn--cancel" (click)="cancel()">
        Cancel
      </button>
      <button mat-raised-button color="accent"
        class="action-btn action-btn--confirm"
        (click)="confirm()"
        [disabled]="!selectedPosition">
        <mat-icon>photo_camera</mat-icon>
        @if (selectedPosition) {
          Capture&nbsp;(–{{ selectedPosition.framesBack }}f)
        } @else {
          Capture
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    /* ========== Header ========== */
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 20px 14px;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: white;
      border-radius: 4px 4px 0 0;
    }

    .dialog-header__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 6px;
      flex-shrink: 0;

      mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
    }

    .dialog-header__text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }

    .dialog-header__title {
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .dialog-header__camera {
      font-size: 0.75rem;
      opacity: 0.8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dialog-close-btn {
      color: white !important;
      opacity: 0.8;
      flex-shrink: 0;
      &:hover { opacity: 1; }
    }

    /* ========== Content ========== */
    .dialog-content {
      padding: 0 !important;
      display: flex;
      flex-direction: column;
      width: min(440px, 92vw);
      max-height: 70vh;
      overflow-y: auto;
    }

    .section {
      padding: 18px 20px;
    }

    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #374151;
      margin-bottom: 12px;
    }

    .required-badge {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #dc2626;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 20px;
      padding: 1px 7px;
    }

    .section-hint {
      font-size: 0.78rem;
      color: #6b7280;
      margin: -4px 0 12px;
    }

    /* ========== Defect type chips ========== */
    .defect-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .defect-chip {
      padding: 8px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 20px;
      background: #f9fafb;
      font-size: 0.85rem;
      font-weight: 600;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, color 0.15s;
      white-space: nowrap;

      &:hover {
        border-color: #a5b4fc;
        background: #eef2ff;
        color: #4f46e5;
      }

      &--selected {
        border-color: #4f46e5;
        background: #4f46e5;
        color: white;
        box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
      }
    }

    /* ========== Ruler grid ========== */
    .ruler-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-bottom: 14px;

      @media (max-width: 360px) {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .ruler-btn {
      min-height: 48px;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      background: #f9fafb;
      font-size: 1rem;
      font-weight: 700;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.1s, box-shadow 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;

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
        box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
      }
    }

    /* ========== Info banner ========== */
    .info-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border-radius: 10px;
      padding: 11px 14px;
      font-size: 0.83rem;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        margin-top: 1px;
      }

      &--active {
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        color: #3730a3;

        mat-icon { color: #4f46e5; }
      }

      &--idle {
        background: #f9fafb;
        border: 1px dashed #d1d5db;
        color: #9ca3af;

        mat-icon { color: #d1d5db; }
      }
    }

    .info-banner__main {
      font-weight: 500;
      line-height: 1.4;
    }

    .info-banner__sub {
      font-size: 0.75rem;
      color: #6366f1;
      margin-top: 2px;
    }

    /* ========== Actions ========== */
    .dialog-actions {
      padding: 12px 20px 16px !important;
      gap: 10px;
      border-top: 1px solid #f3f4f6;
    }

    .action-btn {
      flex: 1;
      height: 44px;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .action-btn--cancel {
      flex: 0 0 auto;
      min-width: 90px;
    }

    .action-btn--confirm {
      display: flex;
      align-items: center;
      gap: 6px;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
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
