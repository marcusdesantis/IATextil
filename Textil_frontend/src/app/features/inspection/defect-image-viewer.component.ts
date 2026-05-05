import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { InspectionSnapshot, DefectAnnotation } from '../../core/models/inspection.models';
import { InspectionService } from '../../core/services/inspection.service';
import { environment } from '../../../environments/environment';

export interface DefectImageViewerData {
  snapshot: InspectionSnapshot;
  sectionCount: number;
  defectTypes: string[];
  allowReselect?: boolean;
}

@Component({
  selector: 'app-defect-image-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <!-- Header -->
    <div class="dialog-header">
      <div class="dialog-header__icon"><mat-icon>image_search</mat-icon></div>
      <div class="dialog-header__text">
        <span class="dialog-header__title">Immagine Difetto</span>
        @if (data.snapshot.rulerPosition) {
          <span class="dialog-header__sub">Posizione righello #{{ data.snapshot.rulerPosition }}</span>
        }
      </div>
      <button class="dialog-close-btn" mat-icon-button (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="dialog-content">
      <div class="overview-wrapper">

        <!-- Image with zone overlay -->
        <div class="image-container">
          @if (loading) {
            <div class="image-loading">
              <mat-spinner diameter="36" />
              <span>Caricamento immagine…</span>
            </div>
          }
          <img
            [src]="imageUrl"
            class="defect-image"
            [class.defect-image--hidden]="loading"
            alt="Immagine difetto"
            (load)="onImageLoad()"
            (error)="onImageError()" />

          @if (!loading && !loadError) {
            <div class="sections-overlay">
              @for (sec of sections; track sec) {
                <div
                  class="section-band"
                  [class.section-band--annotated]="isAnnotated(sec)"
                  [class.section-band--selected]="selectedSection === sec && !isAnnotated(sec) && !savingAnnotation"
                  [class.section-band--saving]="savingAnnotation && selectedSection === sec"
                  (click)="onZoneTap(sec)">
                  @if (savingAnnotation && selectedSection === sec) {
                    <mat-spinner diameter="20" class="saving-spinner" />
                  } @else if (isAnnotated(sec)) {
                    <mat-icon class="annotated-icon">check_circle</mat-icon>
                  } @else if (selectedSection === sec) {
                    <mat-icon class="selected-icon">radio_button_checked</mat-icon>
                  } @else {
                    <span class="section-label">{{ sec }}</span>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (loadError) {
          <div class="error-box">
            <mat-icon>broken_image</mat-icon>
            <span>Impossibile caricare l'immagine del difetto.</span>
          </div>
        }

        <!-- Instruction hint -->
        @if (!loading && !loadError) {
          <p class="overview-hint" [class.overview-hint--pulse]="showPickerHint">
            @if (savingAnnotation) {
              <mat-spinner diameter="16" />
              <span>Saving…</span>
            } @else if (selectedSection !== null && selectedDefectType) {
              <mat-icon>check</mat-icon>
              <span>Zona <strong>{{ selectedSection }}</strong> selezionata come <strong>{{ selectedDefectType }}</strong> — premi Conferma</span>
            } @else if (selectedSection !== null) {
              <mat-icon>arrow_downward</mat-icon>
              <span>Zona <strong>{{ selectedSection }}</strong> selezionata — scegli il tipo di difetto qui sotto</span>
            } @else if (selectedDefectType) {
              <mat-icon>touch_app</mat-icon>
              <span>Tocca la zona nell'immagine dove si trova il difetto</span>
            } @else {
              <mat-icon>arrow_downward</mat-icon>
              <span>Scegli il tipo di difetto qui sotto, poi tocca la zona nell'immagine</span>
            }
          </p>
        }

        <!-- Type chips — always visible -->
        @if (!loading && !loadError) {
          <div class="defect-type-picker" [class.defect-type-picker--highlight]="showPickerHint">
            <span class="picker-label">Che tipo di difetto?</span>
            <div class="picker-chips">
              @for (dt of data.defectTypes; track dt) {
                <button type="button"
                  class="picker-chip"
                  [class.picker-chip--selected]="selectedDefectType === dt"
                  (click)="selectedDefectType = dt; showPickerHint = false">
                  {{ dt }}
                </button>
              }
            </div>
          </div>
        }

        <!-- Confirm button -->
        @if (!loading && !loadError && selectedSection !== null && selectedDefectType) {
          <button mat-raised-button class="confirm-btn"
            [disabled]="savingAnnotation"
            (click)="saveAnnotation()">
            <mat-icon>{{ savingAnnotation ? 'hourglass_empty' : 'save' }}</mat-icon>
            {{ savingAnnotation ? 'Salvataggio…' : 'Conferma — Segna come ' + selectedDefectType }}
          </button>
        }

      </div>
    </mat-dialog-content>

    <!-- Footer -->
    <mat-dialog-actions class="dialog-actions">
      <span class="spacer"></span>
      <button mat-stroked-button (click)="close()">Chiudi</button>
    </mat-dialog-actions>
  `,
  styles: [`
    /* ── Header ── */
    .dialog-header {
      display: flex; align-items: center; gap: 12px;
      padding: 18px 20px 14px;
      background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%);
      color: white; border-radius: 4px 4px 0 0; flex-shrink: 0;
    }
    .dialog-header__icon {
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.2); border-radius: 10px; padding: 6px; flex-shrink: 0;
      mat-icon { font-size: 22px; width: 22px; height: 22px; }
    }
    .dialog-header__text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .dialog-header__title { font-size: 1rem; font-weight: 700; line-height: 1.2; }
    .dialog-header__sub { font-size: 0.78rem; opacity: 0.85; }
    .dialog-close-btn { color: white !important; opacity: 0.8; flex-shrink: 0; &:hover { opacity: 1; } }

    /* ── Content ── */
    .dialog-content { padding: 0 !important; display: flex; flex-direction: column; }

    /* ── Overview ── */
    .overview-wrapper { display: flex; flex-direction: column; padding: 16px; gap: 14px; }

    .image-container {
      position: relative; line-height: 0; border-radius: 10px;
      overflow: hidden; border: 1px solid #e5e7eb; background: #111;
      min-height: 80px;
    }

    .image-loading {
      position: absolute; inset: 0; z-index: 1;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px;
      background: #111; color: #9ca3af; font-size: 0.88rem;
    }

    .defect-image {
      width: 100%; height: auto; display: block;
      max-height: 260px; object-fit: contain; background: #000;
      &--hidden { visibility: hidden; }
    }

    .sections-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: row;
    }

    .section-band {
      flex: 1; border-right: 1px solid rgba(255,255,255,0.15); cursor: pointer;
      display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px;
      transition: background 0.12s;
      &:last-child { border-right: none; }
      &:hover { background: rgba(79,70,229,0.35); }
      &--annotated {
        background: rgba(20,184,166,0.2);
        &:hover { background: rgba(20,184,166,0.4); }
      }
      &--selected {
        background: rgba(249,115,22,0.35);
        border-right-color: rgba(249,115,22,0.5);
      }
      &--saving { background: rgba(79,70,229,0.2); cursor: default; }
    }

    .selected-icon {
      font-size: 22px; width: 22px; height: 22px;
      color: #f97316; filter: drop-shadow(0 0 6px rgba(249,115,22,0.8));
      pointer-events: none; margin-bottom: 4px;
    }

    .section-label {
      font-size: 0.85rem; font-weight: 700;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
      pointer-events: none;
    }

    .annotated-icon {
      font-size: 20px; width: 20px; height: 20px;
      color: #14b8a6; filter: drop-shadow(0 0 4px rgba(20,184,166,0.8));
      pointer-events: none; margin-bottom: 4px;
    }

    .saving-spinner { pointer-events: none; margin-bottom: 4px; }

    .error-box {
      display: flex; align-items: center; gap: 10px;
      padding: 20px; color: #6b7280; font-size: 0.88rem;
      mat-icon { font-size: 32px; width: 32px; height: 32px; color: #d1d5db; }
    }

    /* ── Status hint ── */
    .overview-hint {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.95rem; color: #6b7280; margin: 0;
      padding: 10px 14px; border-radius: 10px; background: #f9fafb;
      border: 1px solid #e5e7eb; transition: border-color 0.2s, background 0.2s;
      mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; color: #9ca3af; }
      strong { color: #0f766e; font-weight: 700; }

      &--pulse {
        border-color: #fbbf24;
        background: #fffbeb;
        mat-icon { color: #f59e0b; }
        animation: hint-shake 0.4s ease;
      }
    }

    @keyframes hint-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    /* ── Type picker ── */
    .defect-type-picker {
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px; border-radius: 12px;
      border: 2px solid #e5e7eb; background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s;

      &--highlight {
        border-color: #fbbf24;
        box-shadow: 0 0 0 3px rgba(251,191,36,0.2);
        animation: hint-shake 0.4s ease;
      }
    }

    .picker-label { font-size: 1rem; font-weight: 700; color: #374151; }

    .picker-chips { display: flex; flex-wrap: wrap; gap: 10px; }

    .picker-chip {
      padding: 12px 22px;
      border: 2px solid #e5e7eb; border-radius: 12px;
      background: #f9fafb; font-size: 1rem; font-weight: 600; color: #374151;
      cursor: pointer; transition: all 0.12s; white-space: nowrap;

      &:hover { border-color: #5eead4; background: #f0fdfa; color: #0f766e; }
      &--selected {
        border-color: #14b8a6; background: #14b8a6; color: white;
        box-shadow: 0 2px 10px rgba(20,184,166,0.35);
      }
    }

    /* ── Confirm button ── */
    .confirm-btn {
      align-self: stretch;
      min-height: 60px;
      font-size: 1.1rem !important;
      font-weight: 700 !important;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      background-color: #16a34a !important;
      color: white !important;
      box-shadow: 0 4px 16px rgba(22,163,74,0.35) !important;
      border-radius: 12px !important;
      mat-icon { font-size: 22px; width: 22px; height: 22px; }
    }

    /* ── Footer ── */
    .dialog-actions {
      padding: 10px 20px 14px !important; border-top: 1px solid #f3f4f6;
      display: flex; align-items: center; gap: 8px;
    }
    .spacer { flex: 1; }
    .reselect-btn {
      font-size: 0.88rem !important;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }
  `],
})
export class DefectImageViewerComponent implements OnInit {
  get sectionCount(): number { return this.data.sectionCount; }
  get sections(): number[] { return Array.from({ length: this.data.sectionCount }, (_, i) => i + 1); }
  readonly imageUrl: string;

  loading = true;
  loadError = false;
  savingAnnotation = false;
  showPickerHint = false;

  selectedSection: number | null = null;
  selectedDefectType: string | null = null;
  annotations: DefectAnnotation[] = [];

  private readonly _img = new Image();

  constructor(
    private dialogRef: MatDialogRef<DefectImageViewerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DefectImageViewerData,
    private inspectionService: InspectionService,
    private snackBar: MatSnackBar,
  ) {
    this.imageUrl = `${environment.apiBaseUrl}/api/inspection/snapshot-image/${data.snapshot.snapshotId}`;
    this._img.onload = () => { this.loading = false; };
    this._img.onerror = () => { this.loading = false; this.loadError = true; };
    this._img.src = this.imageUrl;
  }

  ngOnInit(): void {
    this.inspectionService.getAnnotations(this.data.snapshot.snapshotId).subscribe({
      next: (ann) => (this.annotations = ann),
    });
  }

  onImageLoad(): void { this.loading = false; }
  onImageError(): void { this.loading = false; this.loadError = true; }

  isAnnotated(section: number): boolean {
    return this.annotations.some(a => a.sectionIndex === section);
  }

  onZoneTap(sec: number): void {
    if (this.isAnnotated(sec) || this.savingAnnotation) return;
    this.selectedSection = this.selectedSection === sec ? null : sec;
  }

  saveAnnotation(): void {
    if (this.selectedSection === null || this.savingAnnotation || !this.selectedDefectType) return;

    this.savingAnnotation = true;
    const defectType = this.selectedDefectType;
    const section = this.selectedSection;

    this.inspectionService
      .createAnnotation(this.data.snapshot.snapshotId, section, defectType)
      .subscribe({
        next: (annotation) => {
          this.annotations = [...this.annotations, annotation];
          this.savingAnnotation = false;
          this.selectedSection = null;
          this.snackBar.open(`Salvato come ${defectType}`, undefined, {
            duration: 2000,
            panelClass: ['snack-success'],
            horizontalPosition: 'center',
            verticalPosition: 'top',
          });
        },
        error: () => {
          this.savingAnnotation = false;
          this.selectedSection = null;
          this.snackBar.open('Impossibile salvare. Riprova.', 'OK', {
            duration: 4000,
            panelClass: ['snack-error'],
          });
        },
      });
  }

  close(): void { this.dialogRef.close(); }
  reselect(): void { this.dialogRef.close('reselect'); }
}
