import { Component, OnInit, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { InspectionService } from '../../core/services/inspection.service';
import { CaptureConfigService } from '../../core/services/capture-config.service';
import { CameraInfo, InspectionSnapshot } from '../../core/models/inspection.models';
import {
  CaptureDefectDialogComponent,
  CaptureDefectDialogResult,
} from '../inspection/capture-defect-dialog.component';
import {
  DefectImageViewerComponent,
  DefectImageViewerData,
} from '../inspection/defect-image-viewer.component';

// ── Main operator page ────────────────────────────────────────────────────────

type Phase = 'loading' | 'error' | 'moving' | 'stopped' | 'busy';

@Component({
  selector: 'app-operator',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="op-page">

<!-- ── Loading / Busy ─────────────────────────────────────────────────── -->
      @if (phase === 'loading' || phase === 'busy') {
        <div class="state-screen">
          <mat-spinner diameter="96" />
          <span class="state-sub">{{ phase === 'busy' ? 'Processing, please wait…' : 'Connecting to camera…' }}</span>
        </div>
      }

      <!-- ── Error ─────────────────────────────────────────────────────────── -->
      @if (phase === 'error') {
        <div class="state-screen">
          <mat-icon class="state-icon icon--error">error_outline</mat-icon>
          <span class="state-title title--error">System Error</span>
          <span class="state-sub">{{ errorMsg }}</span>
          <button mat-raised-button color="warn" class="btn-action" (click)="retry()">
            <mat-icon>refresh</mat-icon>
            Try Again
          </button>
        </div>
      }

      <!-- ── Process running ───────────────────────────────────────────────── -->
      @if (phase === 'moving') {
        <div class="state-screen">
          <mat-icon class="state-icon icon--moving">precision_manufacturing</mat-icon>
          <span class="state-title title--moving">Process Running</span>
          <span class="state-sub">Press the button below to stop and capture a defect</span>

          <button mat-raised-button class="btn-action btn--stop" (click)="toggleFabric()">
            <mat-icon>pan_tool</mat-icon>
            Stop Process
          </button>
        </div>
      }

      <!-- ── Process stopped ───────────────────────────────────────────────── -->
      @if (phase === 'stopped') {
        <div class="state-screen">
          <mat-icon class="state-icon icon--stopped">back_hand</mat-icon>
          <span class="state-title title--stopped">Process Stopped</span>
          <span class="state-sub">Select a ruler position and capture the defect, or resume the process</span>

          <button mat-stroked-button class="btn-secondary" (click)="toggleFabric()">
            <mat-icon>precision_manufacturing</mat-icon>
            Continue Process
          </button>

          <button mat-raised-button class="btn-action btn--capture"
            (click)="captureDefect()"
            [disabled]="phase !== 'stopped'">
            <mat-icon>photo_camera</mat-icon>
            Capture Defect
          </button>
        </div>
      }

      <!-- ── Last capture bar ───────────────────────────────────────────────── -->
      @if (lastSnapshot) {
        <div class="last-bar">
          <mat-icon class="last-bar__icon">check_circle</mat-icon>
          <span class="last-bar__text">
            Last capture at {{ formatTime(lastSnapshot.captureTimestamp) }}
            @if (lastSnapshot.defectType) { · <strong>{{ lastSnapshot.defectType }}</strong> }
            @if (lastSnapshot.rulerPosition != null) { · Ruler #{{ lastSnapshot.rulerPosition }} }
          </span>
        </div>
      }

    </div>
  `,
  styles: [`
    .op-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 64px);
      padding: 32px 24px 100px;
      position: relative;
      background: #f8fafc;
    }

    /* ── State screen ── */
    .state-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      text-align: center;
      max-width: 480px;
      width: 100%;
    }

    /* ── Icons ── */
    .state-icon {
      font-size: 96px;
      width: 96px;
      height: 96px;
      line-height: 1;
    }

    .icon--moving  { color: #16a34a; }
    .icon--stopped { color: #d97706; }
    .icon--error   { color: #dc2626; }

    /* ── Titles ── */
    .state-title {
      font-size: 2.4rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .title--moving  { color: #15803d; }
    .title--stopped { color: #b45309; }
    .title--error   { color: #b91c1c; }

    .state-sub {
      font-size: 1.1rem;
      color: #64748b;
      line-height: 1.5;
      max-width: 340px;
    }

    /* ── Primary action buttons ── */
    .btn-action {
      min-height: 80px;
      min-width: 260px;
      font-size: 1.4rem !important;
      font-weight: 700 !important;
      border-radius: 16px !important;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 40px !important;
      margin-top: 12px;

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }

    .btn--stop {
      background-color: #d97706 !important;
      color: white !important;
      box-shadow: 0 4px 16px #d9770640;
      &:hover { background-color: #b45309 !important; }
    }

    .btn--capture {
      background-color: #4f46e5 !important;
      color: white !important;
      box-shadow: 0 4px 24px #4f46e550;
      min-height: 96px;
      font-size: 1.6rem !important;
      mat-icon { font-size: 38px; width: 38px; height: 38px; }
    }

    /* ── Secondary button ── */
    .btn-secondary {
      min-height: 60px;
      min-width: 220px;
      font-size: 1.1rem !important;
      border-radius: 12px !important;
      color: #374151 !important;
      border-color: #d1d5db !important;
      margin-top: 4px;
      mat-icon { font-size: 24px; width: 24px; height: 24px; }
    }

    /* ── Last capture bar ── */
    .last-bar {
      position: fixed;
      bottom: 0;
      left: 220px;
      right: 0;
      background: #f0fdf4;
      border-top: 2px solid #bbf7d0;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1rem;
      color: #166534;
      z-index: 10;
    }

    .last-bar__icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: #16a34a;
      flex-shrink: 0;
    }

    .last-bar__text {
      font-weight: 500;
      strong { font-weight: 700; }
    }

    @media (max-width: 1024px) {
      .last-bar { left: 0; }
    }
  `],
})
export class OperatorComponent implements OnInit, OnDestroy {
  phase: Phase = 'loading';
  errorMsg = '';
  lastSnapshot: InspectionSnapshot | null = null;

  private camera: CameraInfo | null = null;
  private pollSub?: Subscription;

  constructor(
    private inspection: InspectionService,
    public cfg: CaptureConfigService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cfg.loadBackendConfig();
    this.loadAndStart();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  private loadAndStart(): void {
    this.phase = 'loading';
    this.inspection.getCameras().subscribe({
      next: (cameras) => {
        if (!cameras.length) {
          this.phase = 'error';
          this.errorMsg = 'No cameras found. Check the backend connection.';
          return;
        }
        this.camera = cameras[0];
        this.checkOrStart();
      },
      error: () => {
        this.phase = 'error';
        this.errorMsg = 'Could not connect to the system. Check the backend.';
      },
    });
  }

  private checkOrStart(): void {
    this.inspection.getActiveSessions().subscribe({
      next: (sessions) => {
        const existing = sessions.find(s => s.cameraId === this.camera!.id) ?? null;
        if (existing) {
          this.phase = existing.fabricIsMoving ? 'moving' : 'stopped';
          this.startPolling();
        } else {
          this.autoStartRecording();
        }
      },
      error: () => this.autoStartRecording(),
    });
  }

  private autoStartRecording(): void {
    const { machineState, ringBufferSize } = this.cfg.config;
    this.inspection
      .startRecording(this.camera!.id, machineState || undefined, ringBufferSize)
      .subscribe({
        next: () => {
          this.phase = 'moving';
          this.startPolling();
        },
        error: () => {
          this.phase = 'error';
          this.errorMsg = 'Failed to start recording. Check the camera connection.';
        },
      });
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(5000)
      .pipe(switchMap(() => this.inspection.getActiveSessions()))
      .subscribe({
        next: (sessions) => {
          if (!this.camera || this.phase === 'busy') return;
          const s = sessions.find(s => s.cameraId === this.camera!.id);
          if (s) this.phase = s.fabricIsMoving ? 'moving' : 'stopped';
        },
      });
  }

  toggleFabric(): void {
    if (!this.camera || this.phase === 'busy') return;
    const newMovingState = this.phase !== 'moving';
    this.phase = 'busy';
    this.inspection.setFabricState(this.camera.id, newMovingState).subscribe({
      next: (res) => {
        this.phase = res.fabricIsMoving ? 'moving' : 'stopped';
      },
      error: () => {
        this.phase = 'error';
        this.errorMsg = 'Failed to change process state. Try again.';
      },
    });
  }

  captureDefect(): void {
    if (!this.camera || this.phase !== 'stopped') return;

    const openDialog = () => {
      const ref = this.dialog.open(CaptureDefectDialogComponent, {
        data: { cameraName: this.camera!.name, rulerPositions: this.cfg.rulerPositions },
        width: '440px',
        disableClose: false,
      });
      ref.afterClosed().subscribe((result: CaptureDefectDialogResult | undefined) => {
        if (!result) return;
        this.runCapture(result);
      });
    };

    if (this.cfg.backendConfigLoaded) {
      openDialog();
    } else {
      this.cfg.loadBackendConfig(openDialog);
    }
  }

  private runCapture(result: CaptureDefectDialogResult): void {
    if (!this.camera) return;
    this.phase = 'busy';
    const { offsetFrames, frameCount, machineState } = this.cfg.config;

    this.inspection
      .captureDefect(
        this.camera.id,
        result.framesBack ?? offsetFrames,
        frameCount,
        machineState || 'DefectCapture',
        result.rulerPosition ?? undefined,
      )
      .subscribe({
        next: (snapshot) => {
          this.lastSnapshot = snapshot;
          this.phase = 'stopped';
          this.snackBar.open('Defect captured successfully', 'OK', {
            duration: 5500,
            panelClass: ['snack-success'],
            horizontalPosition: 'end',
            verticalPosition: 'bottom',
          });
          this.openImageViewer(snapshot);
        },
        error: (err) => {
          this.phase = 'stopped';
          this.snackBar.open(
            err?.error?.message ?? 'Failed to capture defect. Try again.',
            'OK',
            { duration: 5500, panelClass: ['snack-error'] },
          );
        },
      });
  }

  private openImageViewer(snapshot: InspectionSnapshot): void {
    this.dialog.open(DefectImageViewerComponent, {
      data: {
        snapshot,
        sectionCount: this.cfg.imageSectionCount,
        defectTypes: this.cfg.defectTypes,
        allowReselect: true,
      } satisfies DefectImageViewerData,
      width: '860px',
      maxWidth: '96vw',
      disableClose: false,
    }).afterClosed().subscribe((result: string | undefined) => {
      if (result === 'reselect') {
        this.captureDefect();
      } else {
        this.snackBar.open('Done. Press "Continue Process" when ready.', undefined, {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      }
    });
  }

  retry(): void {
    this.pollSub?.unsubscribe();
    this.loadAndStart();
  }

  formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
