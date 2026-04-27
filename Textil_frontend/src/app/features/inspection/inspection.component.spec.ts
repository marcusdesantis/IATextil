import { ComponentFixture, fakeAsync, TestBed, discardPeriodicTasks, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { InspectionComponent } from './inspection.component';
import { InspectionService } from '../../core/services/inspection.service';
import { CaptureConfigService } from '../../core/services/capture-config.service';
import { CameraInfo, ActiveSession, InspectionSnapshot } from '../../core/models/inspection.models';

// ── Fake data ─────────────────────────────────────────────────────────────────

const CAMERA: CameraInfo = {
  id: 'DEV_001', serial: 'SN001', name: 'Demo Cam 1',
  modelName: 'Vimba Demo', interfaceName: 'USB3',
};

const SESSION_MOVING: ActiveSession = {
  cameraId: 'DEV_001', recordingId: 1, sessionName: 'S1', isRecording: true,
  totalFrames: 320, latestFrameId: 319, fabricIsMoving: true,
  isPaused: false, bufferFrameCount: 200, ringBufferSize: 500,
};

const SESSION_STOPPED: ActiveSession = {
  ...SESSION_MOVING, fabricIsMoving: false, isPaused: true,
};

const FAKE_SNAPSHOT: InspectionSnapshot = {
  snapshotId: 1, recordingId: 1, fileName: 'snap.bin', fileRelativePath: 'snap.bin',
  captureTimestamp: '2024-01-01T00:00:00Z', cameraFrameId: 100,
  machineState: 'DefectCapture', notes: '', defectType: null,
  rulerPosition: null, calculatedOffsetFrames: null,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('InspectionComponent', () => {
  let fixture: ComponentFixture<InspectionComponent>;
  let inspectionSpy: jasmine.SpyObj<InspectionService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let snackBarOpen: jasmine.Spy;
  let cfg: any;

  beforeEach(async () => {
    inspectionSpy = jasmine.createSpyObj<InspectionService>('InspectionService', [
      'getCameras', 'getActiveSessions', 'startRecording',
      'stopRecording', 'setFabricState', 'captureDefect', 'getRulerConfig',
    ]);
    // safe defaults — overridden per test
    inspectionSpy.getCameras.and.returnValue(of([CAMERA]));
    inspectionSpy.getActiveSessions.and.returnValue(of([]));
    inspectionSpy.startRecording.and.returnValue(of({ message: 'ok', cameraId: 'DEV_001', folder: '/f' }));
    inspectionSpy.stopRecording.and.returnValue(of({ message: 'ok', cameraId: 'DEV_001' }));
    inspectionSpy.setFabricState.and.returnValue(of({ message: 'ok', cameraId: 'DEV_001', fabricIsMoving: false }));
    inspectionSpy.captureDefect.and.returnValue(of(FAKE_SNAPSHOT));

    const dialogRefSpy = jasmine.createSpyObj<MatDialogRef<any>>('MatDialogRef', ['afterClosed']);
    dialogRefSpy.afterClosed.and.returnValue(of(undefined)); // cancel by default
    dialogSpy = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    dialogSpy.open.and.returnValue(dialogRefSpy);

    cfg = {
      config: { ringBufferSize: 500, offsetFrames: 100, frameCount: 20, machineState: '' },
      backendConfigLoaded: true,
      rulerPositions: [],
      imageSectionCount: 10,
      defectTypes: ['Slub', 'Knot'],
      loadBackendConfig: jasmine.createSpy('loadBackendConfig').and.callFake(
        (cb?: () => void) => cb?.()
      ),
      save: jasmine.createSpy('save'),
      reset: jasmine.createSpy('reset'),
    };

    await TestBed.configureTestingModule({
      imports: [InspectionComponent],
      providers: [
        provideNoopAnimations(),
        { provide: InspectionService, useValue: inspectionSpy },
        { provide: CaptureConfigService, useValue: cfg },
        { provide: MatDialog, useValue: dialogSpy },
        provideRouter([]),
      ],
    }).compileComponents();
  });

  function create(): void {
    fixture = TestBed.createComponent(InspectionComponent);
    fixture.detectChanges();
    // Access the component's private snackBar field to spy on the actual instance it uses
    snackBarOpen = spyOn((fixture.componentInstance as any).snackBar, 'open');
  }

  function el<T extends HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector) as T | null;
  }
  function text(selector: string): string {
    return el(selector)?.textContent?.trim() ?? '';
  }
  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'));
  }
  // Buttons contain a mat-icon whose text content is part of textContent,
  // so we match against the end of the trimmed string (the label is last).
  function btn(namePattern: RegExp): HTMLButtonElement | undefined {
    return buttons().find(b => namePattern.test(b.textContent?.trim() ?? ''));
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  it('should load cameras and sessions on init', fakeAsync(() => {
    create();
    expect(inspectionSpy.getCameras).toHaveBeenCalledTimes(1);
    expect(inspectionSpy.getActiveSessions).toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('should call cfg.loadBackendConfig on init', fakeAsync(() => {
    create();
    expect(cfg.loadBackendConfig).toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  // ── Camera rendering ───────────────────────────────────────────────────────

  it('should display camera name and model', fakeAsync(() => {
    create();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Demo Cam 1');
    expect(content).toContain('Vimba Demo');
    discardPeriodicTasks();
  }));

  it('should show "No cameras found" when camera list is empty', fakeAsync(() => {
    inspectionSpy.getCameras.and.returnValue(of([]));
    create();
    expect(fixture.nativeElement.textContent).toContain('No cameras found');
    discardPeriodicTasks();
  }));

  it('should show error message when camera endpoint fails', fakeAsync(() => {
    inspectionSpy.getCameras.and.returnValue(throwError(() => new Error('Network')));
    create();
    expect(fixture.nativeElement.textContent).toContain('Could not load cameras');
    discardPeriodicTasks();
  }));

  // ── Idle state (no active session) ─────────────────────────────────────────

  it('should show idle message and enable Start, disable Stop when no session', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([]));
    create();

    expect(fixture.nativeElement.textContent).toContain('No active session');
    expect(btn(/Start$/)).toBeTruthy();
    expect(btn(/Start$/)?.disabled).toBeFalse();
    expect(btn(/Stop$/)?.disabled).toBeTrue();
    expect(el('.rec-badge')).toBeNull();
    discardPeriodicTasks();
  }));

  // ── Recording state ────────────────────────────────────────────────────────

  it('should show REC badge and "Fabric moving" when recording with fabric moving', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_MOVING]));
    create();

    expect(el('.rec-badge')).toBeTruthy();
    expect(el('.rec-badge--paused')).toBeNull();
    expect(text('.fabric-state__main')).toBe('Fabric moving');
    expect(btn(/Stop$/)?.disabled).toBeFalse();
    expect(btn(/Start$/)?.disabled).toBeTrue();
    discardPeriodicTasks();
  }));

  it('should show PAUSED badge and "Fabric stopped" when fabric is stopped', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_STOPPED]));
    create();

    expect(el('.rec-badge--paused')).toBeTruthy();
    expect(text('.fabric-state__main')).toBe('Fabric stopped');
    discardPeriodicTasks();
  }));

  it('should enable Capture button only when fabric is stopped', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_STOPPED]));
    create();

    const captureBtn = btn(/capture/i);
    expect(captureBtn?.disabled).toBeFalse();
    discardPeriodicTasks();
  }));

  it('should disable Capture button while fabric is moving', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_MOVING]));
    create();

    const captureBtn = btn(/capture/i);
    expect(captureBtn?.disabled).toBeTrue();
    discardPeriodicTasks();
  }));

  // ── Button actions ─────────────────────────────────────────────────────────

  it('should call startRecording() with camera id when Start is clicked', fakeAsync(() => {
    create();
    btn(/Start$/)?.click();
    fixture.detectChanges();

    // machineState '' is falsy so the component passes undefined
    expect(inspectionSpy.startRecording).toHaveBeenCalledWith('DEV_001', undefined, 500);
    discardPeriodicTasks();
  }));

  it('should call stopRecording() with camera id when Stop is clicked', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_MOVING]));
    create();

    btn(/Stop$/)?.click();
    fixture.detectChanges();

    expect(inspectionSpy.stopRecording).toHaveBeenCalledWith('DEV_001');
    discardPeriodicTasks();
  }));

  it('should call setFabricState(false) when "Stop fabric" is clicked', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_MOVING]));
    inspectionSpy.setFabricState.and.returnValue(
      of({ message: 'ok', cameraId: 'DEV_001', fabricIsMoving: false })
    );
    create();

    btn(/stop fabric/i)?.click();
    fixture.detectChanges();

    expect(inspectionSpy.setFabricState).toHaveBeenCalledWith('DEV_001', false);
    discardPeriodicTasks();
  }));

  it('should call setFabricState(true) when "Move fabric" is clicked', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_STOPPED]));
    inspectionSpy.setFabricState.and.returnValue(
      of({ message: 'ok', cameraId: 'DEV_001', fabricIsMoving: true })
    );
    create();

    btn(/move fabric/i)?.click();
    fixture.detectChanges();

    expect(inspectionSpy.setFabricState).toHaveBeenCalledWith('DEV_001', true);
    discardPeriodicTasks();
  }));

  it('should open the capture dialog when Capture is clicked', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_STOPPED]));
    create();

    btn(/capture/i)?.click();
    fixture.detectChanges();

    expect(dialogSpy.open).toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  // ── Polling ────────────────────────────────────────────────────────────────

  it('should refresh sessions every 5 seconds via polling', fakeAsync(() => {
    create();
    const callsBefore = inspectionSpy.getActiveSessions.calls.count();

    tick(5000);
    fixture.detectChanges();

    expect(inspectionSpy.getActiveSessions.calls.count()).toBeGreaterThan(callsBefore);
    discardPeriodicTasks();
  }));

  // ── snackbar notifications ─────────────────────────────────────────────────

  it('should show "Recording started" snackbar after successful start', fakeAsync(() => {
    create();
    btn(/Start$/)?.click();
    fixture.detectChanges();

    expect(snackBarOpen).toHaveBeenCalledWith(
      'Recording started', 'Close', jasmine.any(Object)
    );
    discardPeriodicTasks();
  }));

  it('should show "Recording stopped" snackbar after successful stop', fakeAsync(() => {
    inspectionSpy.getActiveSessions.and.returnValue(of([SESSION_MOVING]));
    create();

    btn(/Stop$/)?.click();
    fixture.detectChanges();

    expect(snackBarOpen).toHaveBeenCalledWith(
      'Recording stopped', 'Close', jasmine.any(Object)
    );
    discardPeriodicTasks();
  }));

  // ── Retry ─────────────────────────────────────────────────────────────────

  it('should retry loading cameras when Retry is clicked', fakeAsync(() => {
    inspectionSpy.getCameras.and.returnValue(of([]));
    create();
    const callsBefore = inspectionSpy.getCameras.calls.count();

    btn(/retry/i)?.click();
    fixture.detectChanges();

    expect(inspectionSpy.getCameras.calls.count()).toBeGreaterThan(callsBefore);
    discardPeriodicTasks();
  }));
});
