import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';

import { InspectionService } from '../../core/services/inspection.service';
import { CaptureConfigService } from '../../core/services/capture-config.service';
import { CameraInfo, ActiveSession, InspectionSnapshot } from '../../core/models/inspection.models';
import {
  CaptureDefectDialogComponent,
  CaptureDefectDialogResult,
} from './capture-defect-dialog.component';
import { DefectImageViewerComponent, DefectImageViewerData } from './defect-image-viewer.component';

interface CameraState {
  camera: CameraInfo;
  isRecording: boolean;
  isPaused: boolean;
  session: ActiveSession | null;
  lastSnapshot: InspectionSnapshot | null;
  loading: boolean;
  fabricIsMoving: boolean;
}

@Component({
  selector: 'app-inspection',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressBarModule,
  ],
  templateUrl: './inspection.component.html',
  styleUrls: ['./inspection.component.scss'],
})
export class InspectionComponent implements OnInit, OnDestroy {
  cameras: CameraState[] = [];
  loadingCameras = false;
  globalError: string | null = null;

  private pollingSubscription?: Subscription;

  constructor(
    private inspectionService: InspectionService,
    public cfg: CaptureConfigService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.loadCameras();
    this.startPolling();
    this.cfg.loadBackendConfig();
  }

  ngOnDestroy(): void {
    this.pollingSubscription?.unsubscribe();
  }

  loadCameras(): void {
    this.loadingCameras = true;
    this.globalError = null;

    this.inspectionService.getCameras().subscribe({
      next: (cameras) => {
        this.cameras = cameras.map((cam) => ({
          camera: cam,
          isRecording: false,
          isPaused: false,
          session: null,
          lastSnapshot: null,
          loading: false,
          fabricIsMoving: true,
        }));
        this.loadingCameras = false;
        this.refreshSessions();
      },
      error: () => {
        this.globalError = 'Could not load cameras. Please verify the backend is running.';
        this.loadingCameras = false;
      },
    });
  }

  refreshSessions(): void {
    this.inspectionService.getActiveSessions().subscribe({
      next: (sessions) => {
        this.cameras.forEach((state) => {
          const session = sessions.find((s) => s.cameraId === state.camera.id) ?? null;
          state.session = session;
          state.isRecording = session?.isRecording ?? false;
          if (session) {
            state.fabricIsMoving = session.fabricIsMoving;
            state.isPaused = session.isPaused;
          }
        });
      },
    });
  }

  startPolling(): void {
    this.pollingSubscription = interval(5000)
      .pipe(switchMap(() => this.inspectionService.getActiveSessions()))
      .subscribe({
        next: (sessions) => {
          this.cameras.forEach((state) => {
            const session = sessions.find((s) => s.cameraId === state.camera.id) ?? null;
            state.session = session;
            state.isRecording = session?.isRecording ?? false;
            if (session) {
              state.fabricIsMoving = session.fabricIsMoving;
            }
          });
        },
      });
  }

  startRecording(state: CameraState): void {
    state.loading = true;
    const { machineState, ringBufferSize } = this.cfg.config;
    this.inspectionService.startRecording(state.camera.id, machineState || undefined, ringBufferSize).subscribe({
      next: () => {
        state.isRecording = true;
        state.fabricIsMoving = true;
        state.isPaused = false;
        state.loading = false;
        this.refreshSessions();
        this.notify('Recording started', 'success');
      },
      error: (err) => {
        state.loading = false;
        this.notify(err?.error?.message ?? 'Failed to start recording', 'error');
      },
    });
  }

  stopRecording(state: CameraState): void {
    state.loading = true;
    this.inspectionService.stopRecording(state.camera.id).subscribe({
      next: () => {
        state.isRecording = false;
        state.isPaused = false;
        state.fabricIsMoving = true;
        state.session = null;
        state.loading = false;
        this.notify('Recording stopped', 'success');
      },
      error: (err) => {
        state.loading = false;
        this.notify(err?.error?.message ?? 'Failed to stop recording', 'error');
      },
    });
  }

  toggleFabricState(state: CameraState): void {
    const newState = !state.fabricIsMoving;
    state.loading = true;
    this.inspectionService.setFabricState(state.camera.id, newState).subscribe({
      next: (res) => {
        state.fabricIsMoving = res.fabricIsMoving;
        state.isPaused = !res.fabricIsMoving;
        state.loading = false;
        this.refreshSessions();
        this.notify(
          res.fabricIsMoving ? 'Fabric moving — buffer active' : 'Fabric stopped — buffer frozen',
          'success'
        );
      },
      error: (err) => {
        state.loading = false;
        this.notify(err?.error?.message ?? 'Failed to change fabric state', 'error');
      },
    });
  }

  captureDefect(state: CameraState): void {
    // Ensure backend config is loaded before opening dialog
    this.cfg.loadBackendConfig(() => {
      const ref = this.dialog.open(CaptureDefectDialogComponent, {
        data: {
          cameraName: state.camera.name,
          rulerPositions: this.cfg.rulerPositions,
        },
        width: '440px',
        disableClose: false,
      });

      ref.afterClosed().subscribe((result: CaptureDefectDialogResult | undefined) => {
        if (!result) return;

        state.loading = true;
        const { offsetFrames, frameCount, machineState } = this.cfg.config;

        this.inspectionService
          .captureDefect(
            state.camera.id,
            result.framesBack ?? offsetFrames,
            frameCount,
            machineState || 'DefectCapture',
            result.rulerPosition ?? undefined,
          )
          .subscribe({
            next: (snapshot) => {
              state.lastSnapshot = snapshot;
              state.loading = false;
              const label = snapshot.defectType ? `[${snapshot.defectType}] ` : '';
              const pos = snapshot.rulerPosition != null ? ` · ruler #${snapshot.rulerPosition}` : '';
              this.notify(`${label}Defect captured: ${snapshot.fileName}${pos}`, 'success');
              this.openImageViewer(snapshot);
            },
            error: (err) => {
              state.loading = false;
              this.notify(err?.error?.message ?? 'Failed to capture defect', 'error');
            },
          });
      });
    });
  }

  openImageViewer(snapshot: InspectionSnapshot): void {
    this.dialog.open(DefectImageViewerComponent, {
      data: { snapshot, sectionCount: this.cfg.imageSectionCount, defectTypes: this.cfg.defectTypes } satisfies DefectImageViewerData,
      width: '860px',
      maxWidth: '96vw',
      disableClose: false,
    });
  }

  bufferPercent(state: CameraState): number {
    if (!state.session || state.session.ringBufferSize === 0) return 0;
    return Math.round((state.session.bufferFrameCount / state.session.ringBufferSize) * 100);
  }

  formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString('en-US');
  }

  private notify(message: string, type: 'success' | 'error'): void {
    this.snackBar.open(message, 'Close', {
      duration: 4000,
      panelClass: type === 'error' ? ['snack-error'] : ['snack-success'],
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}
