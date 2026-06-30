import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { InspectionSnapshot, DefectAnnotation } from '../../core/models/inspection.models';
import { InspectionService } from '../../core/services/inspection.service';

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

        <!-- STEP 1 — pick a zone on the full image -->
        @if (selectedSection === null) {
          <div class="image-container" [class.image-container--fill]="stretchOverview">
            @if (loading) {
              <div class="image-loading">
                <mat-spinner diameter="36" />
                <span>Caricamento immagine…</span>
              </div>
            }
            @if (imageUrl) {
              <img
                [src]="imageUrl"
                class="defect-image"
                [class.defect-image--hidden]="loading"
                alt="Immagine difetto"
                (load)="onImageLoad($event)"
                (error)="onImageError()" />
            }

            @if (!loading && !loadError) {
              <div class="sections-overlay" #zonesOverlay>
                @for (sec of sections; track sec) {
                  <div
                    class="section-band"
                    [class.section-band--annotated]="isAnnotated(sec)"
                    (click)="onZoneTap(sec)">
                    @if (isAnnotated(sec)) {
                      <mat-icon class="annotated-icon">check_circle</mat-icon>
                    } @else {
                      <span class="section-label" [style.font-size.px]="sectionLabelFontPx || null">{{ sec }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          @if (!loading && !loadError) {
            <p class="overview-hint">
              <mat-icon>touch_app</mat-icon>
              <span>Tocca la zona nell'immagine dove si trova il difetto</span>
            </p>
          }
        }

        @if (loadError) {
          <div class="error-box">
            <mat-icon>broken_image</mat-icon>
            <span>Impossibile caricare l'immagine del difetto.</span>
          </div>
        }

        <!-- STEP 2 — preview of the chosen zone, then classify -->
        @if (selectedSection !== null && !loadError) {
          <div class="preview-toolbar">
            <button type="button" class="back-btn" (click)="clearSelection()" [disabled]="savingAnnotation">
              <mat-icon>arrow_back</mat-icon>
              Cambia zona
            </button>
            <span class="preview-zone-label">Anteprima zona <strong>{{ selectedSection }}</strong></span>
          </div>

          <div class="zone-preview"
            [style.width.px]="previewBandWidthPx || null"
            [style.height.px]="previewHeightPx">
            <img [src]="imageUrl"
              class="zone-preview__img"
              [style.height.px]="previewHeightPx"
              [style.transform]="'translateX(' + previewTranslatePx + 'px)'"
              alt="Anteprima zona difetto" />
          </div>

          <p class="overview-hint" [class.overview-hint--pulse]="showPickerHint">
            @if (savingAnnotation) {
              <mat-spinner diameter="16" />
              <span>Salvataggio…</span>
            } @else if (selectedDefectType) {
              <mat-icon>check</mat-icon>
              <span>Zona <strong>{{ selectedSection }}</strong> selezionata come <strong>{{ selectedDefectType }}</strong> — premi Conferma</span>
            } @else {
              <mat-icon>arrow_downward</mat-icon>
              <span>Scegli il tipo di difetto qui sotto</span>
            }
          </p>

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

      </div>
    </mat-dialog-content>

    <!-- Footer (always visible — not affected by the image height/scroll) -->
    <mat-dialog-actions class="dialog-actions">
      <button mat-stroked-button (click)="close()">Chiudi</button>
      <span class="spacer"></span>
      @if (!loading && !loadError && selectedSection !== null && selectedDefectType) {
        <button mat-raised-button class="confirm-btn"
          [disabled]="savingAnnotation"
          (click)="saveAnnotation()">
          <mat-icon>{{ savingAnnotation ? 'hourglass_empty' : 'save' }}</mat-icon>
          {{ savingAnnotation ? 'Salvataggio…' : 'Conferma — Segna come ' + selectedDefectType }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    /* Fill the (tall) dialog so the image area gets the full available height.
       flex:1 makes the component fill the flex-column dialog surface; the footer then pins. */
    :host { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; max-height: 100%; overflow: hidden; }

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

    /* ── Content (scrollable, fills the available height) ── */
    .dialog-content {
      padding: 0 !important; display: flex; flex-direction: column;
      flex: 1 1 auto; overflow: auto; min-height: 0; max-height: none !important;
    }

    /* ── Overview ── */
    .overview-wrapper { display: flex; flex-direction: column; padding: 12px; gap: 10px; }

    .image-container {
      position: relative; line-height: 0; border-radius: 10px;
      overflow: hidden; border: 1px solid #e5e7eb; background: #111;
      min-height: 80px;
      /* Wrap tightly around the image so the zone overlay sits exactly on the image
         columns (no letterbox), matching the backend's per-zone crops. The height cap
         keeps the overview from growing taller than the viewport. */
      width: fit-content;
      max-width: 100%;
      margin: 0 auto;
    }

    .image-loading {
      position: absolute; inset: 0; z-index: 1;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px;
      background: #111; color: #9ca3af; font-size: 0.88rem;
    }

    .defect-image {
      display: block;
      width: auto; height: auto;
      max-width: 100%; max-height: 46vh;
      background: #000;
      &--hidden { visibility: hidden; }
    }

    /* Portrait images: stretch to fill the modal width so the zones stay wide/readable.
       (Step-2 preview always shows the true, undistorted crop.) */
    .image-container--fill {
      width: 100%;
      height: 46vh;
    }
    .image-container--fill .defect-image {
      width: 100%; height: 100%;
      max-width: none; max-height: none;
      object-fit: fill;
    }

    .sections-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: row;
    }

    .section-band {
      flex: 1; border-right: 1px solid rgba(255,255,255,0.25); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
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
      font-size: 30px; width: 30px; height: 30px;
      color: #f97316; filter: drop-shadow(0 0 8px rgba(249,115,22,0.9));
      pointer-events: none;
    }

    .section-label {
      /* Fallback size; the exact size is set inline from the band width (see TS). */
      font-size: clamp(0.6rem, 1.2vw, 1.1rem); font-weight: 800;
      color: white;
      text-shadow: 0 1px 6px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.5);
      pointer-events: none;
      line-height: 1;
      white-space: nowrap;
    }

    .annotated-icon {
      font-size: 28px; width: 28px; height: 28px;
      color: #14b8a6; filter: drop-shadow(0 0 5px rgba(20,184,166,0.9));
      pointer-events: none;
    }

    .saving-spinner { pointer-events: none; margin-bottom: 4px; }

    .error-box {
      display: flex; align-items: center; gap: 10px;
      padding: 20px; color: #6b7280; font-size: 0.88rem;
      mat-icon { font-size: 32px; width: 32px; height: 32px; color: #d1d5db; }
    }

    /* ── Zone preview (step 2) ── */
    .preview-toolbar {
      display: flex; align-items: center; gap: 12px;
    }

    .back-btn {
      display: inline-flex; align-items: center; gap: 6px;
      border: 2px solid #e5e7eb; background: #fff; color: #374151;
      border-radius: 10px; padding: 8px 14px;
      font-size: 0.9rem; font-weight: 700; cursor: pointer;
      transition: border-color 0.12s, background 0.12s, color 0.12s;
      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover:not(:disabled) { border-color: #5eead4; background: #f0fdfa; color: #0f766e; }
      &:disabled { opacity: 0.5; cursor: default; }
    }

    .preview-zone-label {
      font-size: 1rem; color: #374151;
      strong { color: #0f766e; font-weight: 800; }
    }

    .zone-preview {
      margin: 0 auto; overflow: hidden; line-height: 0;
      border-radius: 10px; border: 1px solid #e5e7eb; background: #000;
      max-width: 100%;
    }

    .zone-preview__img {
      display: block; width: auto; max-width: none;
    }

    /* ── Status hint ── */
    .overview-hint {
      display: flex; align-items: center; gap: 8px;
      font-size: 1.15rem; color: #6b7280; margin: 0;
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
      display: flex; flex-direction: column; gap: 8px;
      padding: 10px; border-radius: 12px;
      border: 2px solid #e5e7eb; background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s;

      &--highlight {
        border-color: #fbbf24;
        box-shadow: 0 0 0 3px rgba(251,191,36,0.2);
        animation: hint-shake 0.4s ease;
      }
    }

    .picker-label { font-size: 0.9rem; font-weight: 700; color: #374151; }

    .picker-chips {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
    }

    .picker-chip {
      padding: 8px 10px;
      border: 2px solid #e5e7eb; border-radius: 10px;
      background: #f9fafb; font-size: 0.85rem; font-weight: 700; color: #374151;
      cursor: pointer; transition: all 0.12s;
      height: 44px; width: 100%; display: flex; align-items: center;
      justify-content: center; text-align: center; line-height: 1.2;

      &:hover { border-color: #5eead4; background: #f0fdfa; color: #0f766e; }
      &--selected {
        border-color: #14b8a6; background: #14b8a6; color: white;
        box-shadow: 0 3px 14px rgba(20,184,166,0.4);
        transform: scale(1.04);
      }
    }

    /* ── Confirm button (lives in the footer, always visible) ── */
    .confirm-btn {
      min-height: 48px;
      padding: 0 22px !important;
      font-size: 1rem !important;
      font-weight: 700 !important;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      background-color: #16a34a !important;
      color: white !important;
      box-shadow: 0 4px 16px rgba(22,163,74,0.35) !important;
      border-radius: 12px !important;
      mat-icon { font-size: 22px; width: 22px; height: 22px; }
    }

    /* ── Footer: fixed below the scrollable content, so it's always visible ── */
    .dialog-actions {
      padding: 10px 20px 14px !important; border-top: 1px solid #f3f4f6;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      flex-shrink: 0;  /* never shrink/scroll away — always visible at the bottom */
    }
    .spacer { flex: 1; }

    /* On narrow screens (tablet) let the confirm button take the full width below Chiudi */
    @media (max-width: 640px) {
      .confirm-btn { flex: 1 1 100%; order: -1; }
    }
    .reselect-btn {
      font-size: 0.88rem !important;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }
  `],
})
export class DefectImageViewerComponent implements OnInit, OnDestroy {
  get sectionCount(): number { return this.data.sectionCount; }
  get sections(): number[] { return Array.from({ length: this.data.sectionCount }, (_, i) => i + 1); }
  imageUrl = '';

  loading = true;
  loadError = false;
  savingAnnotation = false;
  showPickerHint = false;

  selectedSection: number | null = null;
  selectedDefectType: string | null = null;
  annotations: DefectAnnotation[] = [];

  // Natural pixel size of the loaded image — used to compute the zone preview crop.
  imgNaturalWidth = 0;
  imgNaturalHeight = 0;
  readonly previewHeightPx = 400;

  // Zone-number font size, computed from the rendered band width so every label fits
  // its band (a CSS vw-based size can't know the band width). 0 → CSS fallback.
  sectionLabelFontPx = 0;

  @ViewChild('zonesOverlay') private zonesOverlay?: ElementRef<HTMLElement>;

  private objectUrl: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<DefectImageViewerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DefectImageViewerData,
    private inspectionService: InspectionService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    // Load the image through HttpClient so the auth interceptor attaches the JWT.
    this.inspectionService.getSnapshotImage(this.data.snapshot.snapshotId).subscribe({
      next: (blob) => {
        this.objectUrl = URL.createObjectURL(blob);
        this.imageUrl = this.objectUrl;
      },
      error: () => { this.loading = false; this.loadError = true; },
    });

    this.inspectionService.getAnnotations(this.data.snapshot.snapshotId).subscribe({
      next: (ann) => (this.annotations = ann),
    });
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  /** Portrait images are stretched to fill the modal width so the 20 zones (and their
   *  numbers) stay wide and readable; landscape images are shown at natural aspect. */
  get stretchOverview(): boolean {
    return this.imgNaturalHeight > 0 && this.imgNaturalHeight > this.imgNaturalWidth;
  }

  onImageLoad(ev?: Event): void {
    this.loading = false;
    const img = ev?.target as HTMLImageElement | undefined;
    if (img?.naturalWidth) {
      this.imgNaturalWidth = img.naturalWidth;
      this.imgNaturalHeight = img.naturalHeight;
    }
    // Recompute after the view applies the (possibly stretched) layout, so the font
    // is sized from the final band width.
    setTimeout(() => this.fitZoneLabels());
  }

  /** Size the zone numbers to the actual rendered band width (overlay width ÷ sections). */
  private fitZoneLabels(): void {
    const w = this.zonesOverlay?.nativeElement.offsetWidth ?? 0;
    if (w > 0 && this.sectionCount > 0) {
      const bandPx = w / this.sectionCount;
      this.sectionLabelFontPx = Math.max(8, Math.min(20, bandPx * 0.5));
    }
  }
  onImageError(): void { this.loading = false; this.loadError = true; }

  // ── Zone preview (step 2) ─────────────────────────────────────────────────
  // The image is scaled to previewHeightPx tall; we then show only the 1/N-wide
  // band of the selected section and shift it into view with translateX. This
  // mirrors exactly the equal-width column the backend crops on save.
  private get previewScale(): number {
    return this.imgNaturalHeight > 0 ? this.previewHeightPx / this.imgNaturalHeight : 0;
  }
  get previewBandWidthPx(): number {
    return this.sectionCount > 0 ? (this.imgNaturalWidth * this.previewScale) / this.sectionCount : 0;
  }
  get previewTranslatePx(): number {
    return -((this.selectedSection ?? 1) - 1) * this.previewBandWidthPx;
  }

  isAnnotated(section: number): boolean {
    return this.annotations.some(a => a.sectionIndex === section);
  }

  onZoneTap(sec: number): void {
    if (this.isAnnotated(sec) || this.savingAnnotation) return;
    this.selectedSection = this.selectedSection === sec ? null : sec;
  }

  /** Go back to the zone-selection step (step 1) — e.g. wrong position picked. */
  clearSelection(): void {
    if (this.savingAnnotation) return;
    this.selectedSection = null;
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
          this.dialogRef.close(true);
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
