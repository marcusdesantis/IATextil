import { Component, Inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { InspectionSnapshot, DefectAnnotation } from '../../core/models/inspection.models';
import { InspectionService } from '../../core/services/inspection.service';
import { environment } from '../../../environments/environment';

export interface DefectImageViewerData {
  snapshot: InspectionSnapshot;
  sectionCount: number;
  defectTypes: string[];
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
  ],
  template: `
    <!-- Header -->
    <div class="dialog-header">
      <div class="dialog-header__icon"><mat-icon>image_search</mat-icon></div>
      <div class="dialog-header__text">
        <span class="dialog-header__title">Defect Image</span>
        <span class="dialog-header__sub">
          @if (data.snapshot.rulerPosition) { Ruler #{{ data.snapshot.rulerPosition }} · }
          {{ data.snapshot.fileName }}
        </span>
      </div>
      <button class="dialog-close-btn" mat-icon-button (click)="close()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="dialog-content">

      <!-- Error state -->
      @if (loadError) {
        <div class="state-box state-box--error">
          <mat-icon>broken_image</mat-icon>
          <span>Could not load the defect image.</span>
        </div>
      }

      <!-- Overview: image always in DOM so onload fires; hidden until ready -->
      @if (!loadError && selectedSection === null) {
        <div class="overview-wrapper">
          @if (loading) {
            <div class="state-box">
              <mat-spinner diameter="36" />
              <span>Loading image…</span>
            </div>
          }

          <div class="image-container" [class.image-container--hidden]="loading">
            <img
              [src]="imageUrl"
              class="defect-image"
              alt="Defect image" />

            @if (imageLoaded) {
              <div class="sections-overlay">
                @for (sec of sections; track sec) {
                  <div
                    class="section-band"
                    [class.section-band--annotated]="isAnnotated(sec)"
                    [class.section-band--hovered]="hoveredSection === sec"
                    (mouseenter)="hoveredSection = sec"
                    (mouseleave)="hoveredSection = null"
                    (click)="selectSection(sec)"
                    [matTooltip]="sectionTooltip(sec)"
                    matTooltipPosition="above">
                    @if (isAnnotated(sec)) {
                      <mat-icon class="annotated-icon">check_circle</mat-icon>
                    } @else {
                      <span class="section-label">{{ sec }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          @if (imageLoaded) {
            <p class="overview-hint">
              <mat-icon>touch_app</mat-icon>
              Tap a section to zoom in and save it as a defect annotation.
              @if (annotations.length > 0) {
                &nbsp;<strong>{{ annotations.length }} section{{ annotations.length > 1 ? 's' : '' }} marked.</strong>
              }
            </p>
          }
        </div>
      }

      <!-- Zoomed view -->
      @if (!loadError && selectedSection !== null) {
        <div class="zoomed-wrapper">
          <div class="zoomed-toolbar">
            <button mat-icon-button (click)="backToOverview()" matTooltip="Back to full image">
              <mat-icon>arrow_back</mat-icon>
            </button>
            <div class="zoomed-label">
              <span>Section {{ selectedSection }}</span>
              <span class="zoomed-range">{{ sectionPercent(selectedSection) }}</span>
              @if (savingAnnotation) {
                <mat-spinner diameter="16" class="saving-spinner" />
              }
              @if (isAnnotated(selectedSection) && !savingAnnotation) {
                <span class="annotated-badge"><mat-icon>check_circle</mat-icon> Saved</span>
              }
            </div>
            <div class="zoomed-nav">
              <button mat-icon-button [disabled]="selectedSection <= 1"
                (click)="selectedSection = selectedSection - 1; renderZoom(selectedSection)"
                matTooltip="Previous">
                <mat-icon>chevron_left</mat-icon>
              </button>
              <button mat-icon-button [disabled]="selectedSection >= sectionCount"
                (click)="selectedSection = selectedSection + 1; renderZoom(selectedSection)"
                matTooltip="Next">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </div>

          <canvas #zoomCanvas class="zoom-canvas"></canvas>

          @if (!isAnnotated(selectedSection)) {
            <div class="defect-type-picker">
              <span class="picker-label">Defect type</span>
              <div class="picker-chips">
                @for (dt of data.defectTypes; track dt) {
                  <button type="button"
                    class="picker-chip"
                    [class.picker-chip--selected]="selectedDefectType === dt"
                    (click)="selectedDefectType = dt">
                    {{ dt }}
                  </button>
                }
              </div>
            </div>

            <button mat-raised-button color="accent" class="save-btn"
              [disabled]="savingAnnotation || !selectedDefectType"
              (click)="saveAnnotation()">
              <mat-icon>save</mat-icon>
              Save section {{ selectedSection }}
              @if (selectedDefectType) { — {{ selectedDefectType }} }
            </button>
          }
        </div>
      }

    </mat-dialog-content>

    <mat-dialog-actions class="dialog-actions">
      <span class="filename-hint">{{ data.snapshot.fileName }}</span>
      <button mat-stroked-button (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    /* ===== Header ===== */
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
    .dialog-header__text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
    .dialog-header__title { font-size: 0.95rem; font-weight: 700; line-height: 1.2; }
    .dialog-header__sub { font-size: 0.75rem; opacity: 0.85; }
    .dialog-close-btn { color: white !important; opacity: 0.8; flex-shrink: 0; &:hover { opacity: 1; } }

    /* ===== Content ===== */
    .dialog-content { padding: 0 !important; display: flex; flex-direction: column; overflow-y: auto; }

    /* ===== State boxes ===== */
    .state-box {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 14px; padding: 40px 24px;
      color: #6b7280; font-size: 0.88rem;
      &--error mat-icon { font-size: 48px; width: 48px; height: 48px; color: #d1d5db; }
    }

    /* ===== Overview ===== */
    .overview-wrapper { display: flex; flex-direction: column; padding: 16px; gap: 10px; }

    .image-container {
      position: relative; line-height: 0; border-radius: 8px;
      overflow: hidden; border: 1px solid #e5e7eb; background: #111;
      &--hidden { display: none; }
    }

    .defect-image {
      width: 100%; height: auto; display: block;
      max-height: 220px; object-fit: contain; background: #000;
    }

    /* ===== Section bands overlay ===== */
    .sections-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: row;
    }

    .section-band {
      flex: 1; border-right: 1px solid rgba(255,255,255,0.2); cursor: pointer;
      position: relative; display: flex; align-items: flex-end;
      justify-content: center; padding-bottom: 4px;
      transition: background 0.12s;
      &:last-child { border-right: none; }

      &:hover, &--hovered {
        background: rgba(20, 184, 166, 0.35);
      }

      &--annotated {
        background: rgba(20, 184, 166, 0.18);
        border-right-color: rgba(20, 184, 166, 0.5);
        &:hover, &.section-band--hovered {
          background: rgba(20, 184, 166, 0.4);
        }
      }
    }

    .section-label {
      font-size: 0.65rem; font-weight: 700;
      color: rgba(255,255,255,0.7); line-height: 1; pointer-events: none;
    }

    .annotated-icon {
      font-size: 16px; width: 16px; height: 16px;
      color: #14b8a6; filter: drop-shadow(0 0 3px rgba(20,184,166,0.8));
      pointer-events: none; margin-bottom: 2px;
    }

    /* ===== Hint ===== */
    .overview-hint {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.78rem; color: #6b7280; margin: 0;
      mat-icon { font-size: 15px; width: 15px; height: 15px; color: #9ca3af; }
      strong { color: #0f766e; }
    }

    /* ===== Zoomed view ===== */
    .zoomed-wrapper { display: flex; flex-direction: column; padding: 12px 16px 16px; gap: 10px; }

    .zoomed-toolbar {
      display: flex; align-items: center; gap: 8px;
    }

    .zoomed-label {
      flex: 1; display: flex; align-items: center; gap: 8px;
      font-size: 0.88rem; font-weight: 600; color: #374151;
    }

    .zoomed-range { font-size: 0.75rem; font-weight: 400; color: #9ca3af; }

    .saving-spinner { flex-shrink: 0; }

    .annotated-badge {
      display: flex; align-items: center; gap: 3px;
      font-size: 0.75rem; font-weight: 600; color: #0f766e;
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
    }

    .zoomed-nav { display: flex; }

    .zoom-canvas {
      width: 100%; height: auto; border-radius: 8px;
      border: 1px solid #e5e7eb; background: #111;
      display: block; max-height: 260px;
    }

    .defect-type-picker {
      display: flex; flex-direction: column; gap: 8px;
    }

    .picker-label {
      font-size: 0.72rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280;
    }

    .picker-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
    }

    .picker-chip {
      padding: 6px 14px;
      border: 2px solid #e5e7eb;
      border-radius: 20px;
      background: #f9fafb;
      font-size: 0.82rem;
      font-weight: 600;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.12s, background 0.12s, color 0.12s;
      white-space: nowrap;

      &:hover { border-color: #5eead4; background: #f0fdfa; color: #0f766e; }

      &--selected {
        border-color: #14b8a6;
        background: #14b8a6;
        color: white;
        box-shadow: 0 2px 8px rgba(20, 184, 166, 0.3);
      }
    }

    .save-btn {
      align-self: stretch;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      min-height: 44px;
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }

    /* ===== Actions ===== */
    .dialog-actions {
      padding: 10px 20px 14px !important; border-top: 1px solid #f3f4f6;
      display: flex; align-items: center; gap: 8px;
    }
    .filename-hint {
      flex: 1; font-size: 0.72rem; color: #9ca3af;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
  `],
})
export class DefectImageViewerComponent implements OnInit {
  @ViewChild('zoomCanvas') zoomCanvasRef?: ElementRef<HTMLCanvasElement>;

  get sectionCount(): number { return this.data.sectionCount; }
  get sections(): number[] { return Array.from({ length: this.data.sectionCount }, (_, i) => i + 1); }
  readonly imageUrl: string;

  loading = true;
  loadError = false;
  imageLoaded = false;
  savingAnnotation = false;

  hoveredSection: number | null = null;
  selectedSection: number | null = null;
  selectedDefectType: string | null = null;

  annotations: DefectAnnotation[] = [];

  // In-memory image — stays alive regardless of which @if branch is active
  private readonly _img = new Image();

  constructor(
    private dialogRef: MatDialogRef<DefectImageViewerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DefectImageViewerData,
    private inspectionService: InspectionService,
  ) {
    this.imageUrl = `${environment.apiBaseUrl}/api/inspection/snapshot-image/${data.snapshot.snapshotId}`;

    this._img.onload = () => {
      this.loading = false;
      this.imageLoaded = true;
    };
    this._img.onerror = () => {
      this.loading = false;
      this.loadError = true;
    };
    this._img.src = this.imageUrl;
  }

  ngOnInit(): void {
    this.inspectionService.getAnnotations(this.data.snapshot.snapshotId).subscribe({
      next: (ann) => (this.annotations = ann),
    });
  }


  isAnnotated(section: number): boolean {
    return this.annotations.some((a) => a.sectionIndex === section);
  }

  sectionPercent(index: number): string {
    const start = Math.round(((index - 1) / this.sectionCount) * 100);
    const end = Math.round((index / this.sectionCount) * 100);
    return `${start}%–${end}%`;
  }

  sectionTooltip(section: number): string {
    return this.isAnnotated(section)
      ? `Section ${section} — already saved`
      : `Section ${section} — ${this.sectionPercent(section)} · click to annotate`;
  }

  selectSection(section: number): void {
    this.selectedSection = section;
    setTimeout(() => this.renderZoom(section), 0);
  }

  backToOverview(): void {
    this.selectedSection = null;
  }

  renderZoom(sectionIndex: number): void {
    const canvas = this.zoomCanvasRef?.nativeElement;
    const img = this._img;
    if (!canvas || !img.complete || img.naturalWidth === 0) return;

    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    const sectionW = Math.floor(naturalW / this.sectionCount);
    const sx = (sectionIndex - 1) * sectionW;
    const sw = sectionIndex === this.sectionCount ? naturalW - sx : sectionW;

    // Scale to a comfortable display size (tall enough to see detail)
    const displayW = 780;
    const displayH = Math.max(Math.round((naturalH / sw) * displayW), 100);

    canvas.width = displayW;
    canvas.height = displayH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, 0, sw, naturalH, 0, 0, displayW, displayH);

    // Teal border to indicate already-annotated sections
    if (this.isAnnotated(sectionIndex)) {
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.8)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, displayW - 4, displayH - 4);
    }
  }

  saveAnnotation(): void {
    if (this.selectedSection === null || this.savingAnnotation || !this.selectedDefectType) return;

    this.savingAnnotation = true;
    this.inspectionService
      .createAnnotation(this.data.snapshot.snapshotId, this.selectedSection, this.selectedDefectType)
      .subscribe({
        next: (annotation) => {
          this.annotations = [...this.annotations, annotation];
          this.savingAnnotation = false;
          // Re-render to show the teal saved border
          setTimeout(() => this.renderZoom(this.selectedSection!), 0);
        },
        error: () => {
          this.savingAnnotation = false;
        },
      });
  }

  close(): void {
    this.dialogRef.close();
  }
}
