import { Component, OnInit, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { InspectionService } from '../../core/services/inspection.service';
import { CaptureConfigService } from '../../core/services/capture-config.service';
import { CameraInfo, InspectionSnapshot } from '../../core/models/inspection.models';
import { RulerPositionInfo } from '../inspection/capture-defect-dialog.component';
import {
  DefectImageViewerComponent,
  DefectImageViewerData,
} from '../inspection/defect-image-viewer.component';

type Phase = 'loading' | 'error' | 'moving' | 'stopped' | 'busy';

@Component({
  selector: 'app-operator',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="op-page">

      <!-- ── Loading / Busy ── -->
      @if (phase === 'loading' || phase === 'busy') {
        <div class="state-screen">
          <mat-spinner diameter="96" />
          <span class="state-sub">{{ phase === 'busy' ? 'Elaborazione in corso, attendere…' : 'Connessione alla telecamera…' }}</span>
        </div>
      }

      <!-- ── Error ── -->
      @if (phase === 'error') {
        <div class="state-screen">
          <mat-icon class="state-icon icon--error">error_outline</mat-icon>
          <span class="state-title title--error">Errore di sistema</span>
          <span class="state-sub">{{ errorMsg }}</span>
          <button mat-raised-button color="warn" class="btn-action" (click)="retry()">
            <mat-icon>refresh</mat-icon>
            Riprova
          </button>
        </div>
      }

      <!-- ── Process running ── -->
      @if (phase === 'moving') {
        <div class="state-screen">
          <mat-icon class="state-icon icon--moving icon--spinning">settings</mat-icon>
          <span class="state-title title--moving">Processo in corso</span>
          <span class="state-sub">Premi il pulsante qui sotto per fermare e catturare un difetto</span>
          <button mat-raised-button class="btn-action btn--stop" (click)="toggleFabric()">
            <mat-icon>pan_tool</mat-icon>
            Ferma processo
          </button>
        </div>
      }

      <!-- ── Process stopped ── -->
      @if (phase === 'stopped') {
        <div class="state-screen">
          <mat-icon class="state-icon icon--stopped">back_hand</mat-icon>
          <span class="state-title title--stopped">Processo fermo</span>

          <span class="state-sub">Seleziona la posizione sul righello dove hai visto il difetto</span>

          <!-- Ruler position grid — tap to capture immediately -->
          <div class="ruler-grid">
            @for (pos of cfg.rulerPositions; track pos.position) {
              <button type="button" class="pos-btn"
                (click)="captureDefect(pos)">
                {{ pos.position }}
              </button>
            }
          </div>

          <button class="btn-text-link" (click)="toggleFabric()">
            <mat-icon>precision_manufacturing</mat-icon>
            Continua senza catturare
          </button>
        </div>
      }

      <!-- ── Last capture bar ── -->
      @if (lastSnapshot) {
        <div class="last-bar">
          <mat-icon class="last-bar__icon">check_circle</mat-icon>
          <span class="last-bar__text">
            Ultima cattura alle {{ formatTime(lastSnapshot.captureTimestamp) }}
            @if (lastSnapshot.defectType) { · <strong>{{ lastSnapshot.defectType }}</strong> }
            @if (lastSnapshot.rulerPosition != null) { · Righello #{{ lastSnapshot.rulerPosition }} }
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

    .icon--spinning {
      animation: spin 3s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

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

    .state-sub--selected {
      color: #15803d;
      font-weight: 600;
      strong { font-weight: 800; }
    }

    /* ── Ruler grid ── */
    .ruler-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      width: 100%;
      max-width: 440px;
    }

    .pos-btn {
      height: 68px;
      border: 2px solid #e5e7eb;
      border-radius: 14px;
      background: #f9fafb;
      font-size: 1.5rem;
      font-weight: 700;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.1s, box-shadow 0.15s;

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

    /* ── Text link (secondary action) ── */
    .btn-text-link {
      background: none;
      border: 2px solid #d1d5db;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4b5563;
      font-size: 1rem;
      font-weight: 600;
      padding: 12px 24px;
      border-radius: 12px;
      margin-top: 12px;
      transition: color 0.15s, background 0.15s, border-color 0.15s;

      mat-icon { font-size: 20px; width: 20px; height: 20px; }
      &:hover { color: #111827; background: #f3f4f6; border-color: #9ca3af; }
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
          this.errorMsg = 'Nessuna telecamera trovata. Verifica la connessione al backend.';
          return;
        }
        this.camera = cameras[0];
        this.checkOrStart();
      },
      error: () => {
        this.phase = 'error';
        this.errorMsg = 'Impossibile connettersi al sistema. Verifica il backend.';
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
          this.errorMsg = 'Impossibile avviare la registrazione. Verifica la connessione della telecamera.';
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
        this.errorMsg = 'Impossibile cambiare lo stato del processo. Riprova.';
      },
    });
  }

  captureDefect(pos: RulerPositionInfo): void {
    if (!this.camera || this.phase !== 'stopped') return;
    this.runCapture({ rulerPosition: pos.position, framesBack: pos.framesBack });
  }

  private runCapture(result: { rulerPosition: number; framesBack: number }): void {
    if (!this.camera) return;
    this.phase = 'busy';
    const { offsetFrames, frameCount, machineState } = this.cfg.config;

    this.inspection
      .captureDefect(
        this.camera.id,
        result.framesBack ?? offsetFrames,
        frameCount,
        machineState || 'DefectCapture',
        result.rulerPosition,
      )
      .subscribe({
        next: (snapshot) => {
          this.lastSnapshot = snapshot;
          this.phase = 'stopped';
          this.snackBar.open('Difetto catturato con successo', 'OK', {
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
            err?.error?.message ?? 'Impossibile catturare il difetto. Riprova.',
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
      } satisfies DefectImageViewerData,
      width: '860px',
      maxWidth: '96vw',
      disableClose: false,
    }).afterClosed().subscribe(() => {
      this.snackBar.open('Fatto. Premi «Continua» quando sei pronto.', undefined, {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
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
