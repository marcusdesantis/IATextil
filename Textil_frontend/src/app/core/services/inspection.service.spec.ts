import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpRequest } from '@angular/common/http';

import { InspectionService } from './inspection.service';
import {
  CameraInfo,
  ActiveSession,
  InspectionSnapshot,
  DefectAnnotation,
  StartRecordingResponse,
  StopRecordingResponse,
} from '../models/inspection.models';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiBaseUrl}/api/inspection`;

// ── Shared fake data ──────────────────────────────────────────────────────────

const FAKE_CAMERA: CameraInfo = {
  id: 'DEV_001',
  serial: 'SN001',
  name: 'Demo Cam 1',
  modelName: 'Demo',
  interfaceName: 'USB3',
};

const FAKE_SESSION: ActiveSession = {
  cameraId: 'DEV_001',
  recordingId: 1,
  sessionName: 'session-001',
  isRecording: true,
  totalFrames: 500,
  latestFrameId: 499,
  fabricIsMoving: true,
  isPaused: false,
  bufferFrameCount: 300,
  ringBufferSize: 500,
};

const FAKE_SNAPSHOT: InspectionSnapshot = {
  snapshotId: 1,
  recordingId: 10,
  fileName: 'snapshot_001.bin',
  fileRelativePath: 'captures/DEV_001/snapshot_001.bin',
  captureTimestamp: '2026-04-24T10:00:00Z',
  cameraFrameId: 12345,
  machineState: 'DefectCapture',
  notes: '',
  defectType: null,
  rulerPosition: 3,
  calculatedOffsetFrames: 156,
};

const FAKE_ANNOTATION: DefectAnnotation = {
  annotationId: 1,
  snapshotId: 1,
  sectionIndex: 3,
  defectType: 'Slub',
  cropImagePath: 'captures/DEV_001/snapshot_001_s3.png',
  createdAt: '2026-04-24T10:01:00Z',
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('InspectionService', () => {
  let service: InspectionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [InspectionService],
    });
    service = TestBed.inject(InspectionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Fails the test if any request was made but not asserted
    httpMock.verify();
  });

  // ── getCameras ──────────────────────────────────────────────────────────────

  describe('getCameras', () => {
    it('should GET /cameras and return a CameraInfo array', () => {
      let result: CameraInfo[] | undefined;

      service.getCameras().subscribe(data => (result = data));

      const req = httpMock.expectOne(`${BASE}/cameras`);
      expect(req.request.method).toBe('GET');
      req.flush([FAKE_CAMERA]);

      expect(result).toEqual([FAKE_CAMERA]);
    });
  });

  // ── getRulerConfig ──────────────────────────────────────────────────────────

  describe('getRulerConfig', () => {
    it('should GET /ruler-config and return the full config object', () => {
      const fakeConfig = {
        defectTypes: ['Slub', 'Floats', 'Knot', 'Holes', 'Ladder'],
        imageSectionCount: 10,
        positionCount: 12,
        baseDistanceCm: 50,
        positionSpacingCm: 5,
        cmPerFrame: 0.4,
        positions: [{ position: 1, distanceCm: 52.5, framesBack: 131 }],
      };
      let result: any;

      service.getRulerConfig().subscribe(data => (result = data));

      const req = httpMock.expectOne(`${BASE}/ruler-config`);
      expect(req.request.method).toBe('GET');
      req.flush(fakeConfig);

      expect(result.defectTypes).toEqual(['Slub', 'Floats', 'Knot', 'Holes', 'Ladder']);
      expect(result.positionCount).toBe(12);
      expect(result.positions.length).toBe(1);
    });
  });

  // ── getActiveSessions ───────────────────────────────────────────────────────

  describe('getActiveSessions', () => {
    it('should GET /active-sessions and return an ActiveSession array', () => {
      let result: ActiveSession[] | undefined;

      service.getActiveSessions().subscribe(data => (result = data));

      const req = httpMock.expectOne(`${BASE}/active-sessions`);
      expect(req.request.method).toBe('GET');
      req.flush([FAKE_SESSION]);

      expect(result).toEqual([FAKE_SESSION]);
    });
  });

  // ── startRecording ──────────────────────────────────────────────────────────

  describe('startRecording', () => {
    it('should POST to /start-recording/{cameraId} without query params when none provided', () => {
      const fakeResponse: StartRecordingResponse = {
        message: 'Recording started',
        cameraId: 'DEV_001',
        folder: '/captures/DEV_001/20260424',
      };
      let result: StartRecordingResponse | undefined;

      service.startRecording('DEV_001').subscribe(data => (result = data));

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/start-recording/DEV_001`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.params.has('machineState')).toBeFalse();
      expect(req.request.params.has('ringBufferSize')).toBeFalse();
      req.flush(fakeResponse);

      expect(result?.cameraId).toBe('DEV_001');
    });

    it('should include machineState and ringBufferSize as query params when provided', () => {
      service.startRecording('DEV_001', 'Production', 300).subscribe();

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/start-recording/DEV_001`
      );
      expect(req.request.params.get('machineState')).toBe('Production');
      expect(req.request.params.get('ringBufferSize')).toBe('300');
      req.flush({ message: 'ok', cameraId: 'DEV_001', folder: '/f' });
    });

    it('should URL-encode cameraId with special characters', () => {
      service.startRecording('CAM/01').subscribe();

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url.includes('CAM%2F01')
      );
      req.flush({ message: 'ok', cameraId: 'CAM/01', folder: '/f' });

      expect(req).toBeTruthy();
    });
  });

  // ── stopRecording ───────────────────────────────────────────────────────────

  describe('stopRecording', () => {
    it('should POST to /stop-recording/{cameraId}', () => {
      const fakeResponse: StopRecordingResponse = {
        message: 'Recording stopped',
        cameraId: 'DEV_001',
      };
      let result: StopRecordingResponse | undefined;

      service.stopRecording('DEV_001').subscribe(data => (result = data));

      const req = httpMock.expectOne(`${BASE}/stop-recording/DEV_001`);
      expect(req.request.method).toBe('POST');
      req.flush(fakeResponse);

      expect(result?.message).toBe('Recording stopped');
    });
  });

  // ── setFabricState ──────────────────────────────────────────────────────────

  describe('setFabricState', () => {
    it('should POST with isMoving=true when fabric is moving', () => {
      service.setFabricState('DEV_001', true).subscribe();

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/fabric-state/DEV_001`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.params.get('isMoving')).toBe('true');
      req.flush({ message: 'Fabric moving', cameraId: 'DEV_001', fabricIsMoving: true });
    });

    it('should POST with isMoving=false when fabric is stopped', () => {
      service.setFabricState('DEV_001', false).subscribe();

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/fabric-state/DEV_001`
      );
      expect(req.request.params.get('isMoving')).toBe('false');
      req.flush({ message: 'Fabric stopped', cameraId: 'DEV_001', fabricIsMoving: false });
    });
  });

  // ── captureImage ────────────────────────────────────────────────────────────

  describe('captureImage', () => {
    it('should POST to /capture/{cameraId} and return a snapshot', () => {
      let result: InspectionSnapshot | undefined;

      service.captureImage('DEV_001', 'Manual').subscribe(data => (result = data));

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/capture/DEV_001`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.params.get('machineState')).toBe('Manual');
      req.flush(FAKE_SNAPSHOT);

      expect(result?.snapshotId).toBe(1);
    });
  });

  // ── captureDefect ───────────────────────────────────────────────────────────

  describe('captureDefect', () => {
    it('should POST to /capture-defect/{cameraId} with rulerPosition param', () => {
      let result: InspectionSnapshot | undefined;

      service.captureDefect('DEV_001', undefined, undefined, undefined, 3)
        .subscribe(data => (result = data));

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/capture-defect/DEV_001`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.params.get('rulerPosition')).toBe('3');
      req.flush(FAKE_SNAPSHOT);

      expect(result?.rulerPosition).toBe(3);
    });

    it('should not include optional params when not provided', () => {
      service.captureDefect('DEV_001').subscribe();

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/capture-defect/DEV_001`
      );
      expect(req.request.params.has('offsetFrames')).toBeFalse();
      expect(req.request.params.has('frameCount')).toBeFalse();
      expect(req.request.params.has('machineState')).toBeFalse();
      expect(req.request.params.has('rulerPosition')).toBeFalse();
      req.flush(FAKE_SNAPSHOT);
    });

    it('should include all optional params when provided', () => {
      service.captureDefect('DEV_001', 150, 20, 'DefectCapture', 5).subscribe();

      const req = httpMock.expectOne((r: HttpRequest<any>) =>
        r.url === `${BASE}/capture-defect/DEV_001`
      );
      expect(req.request.params.get('offsetFrames')).toBe('150');
      expect(req.request.params.get('frameCount')).toBe('20');
      expect(req.request.params.get('machineState')).toBe('DefectCapture');
      expect(req.request.params.get('rulerPosition')).toBe('5');
      req.flush(FAKE_SNAPSHOT);
    });
  });

  // ── getAnnotations ──────────────────────────────────────────────────────────

  describe('getAnnotations', () => {
    it('should GET /snapshot/{snapshotId}/annotations and return annotation array', () => {
      let result: DefectAnnotation[] | undefined;

      service.getAnnotations(1).subscribe(data => (result = data));

      const req = httpMock.expectOne(`${BASE}/snapshot/1/annotations`);
      expect(req.request.method).toBe('GET');
      req.flush([FAKE_ANNOTATION]);

      expect(result).toEqual([FAKE_ANNOTATION]);
    });

    it('should return empty array when no annotations exist', () => {
      let result: DefectAnnotation[] | undefined;

      service.getAnnotations(99).subscribe(data => (result = data));

      httpMock.expectOne(`${BASE}/snapshot/99/annotations`).flush([]);

      expect(result).toEqual([]);
    });
  });

  // ── createAnnotation ────────────────────────────────────────────────────────

  describe('createAnnotation', () => {
    it('should POST to /snapshot/{snapshotId}/annotations with correct body', () => {
      let result: DefectAnnotation | undefined;

      service.createAnnotation(1, 3, 'Slub').subscribe(data => (result = data));

      const req = httpMock.expectOne(`${BASE}/snapshot/1/annotations`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ sectionIndex: 3, defectType: 'Slub' });
      req.flush(FAKE_ANNOTATION);

      expect(result?.sectionIndex).toBe(3);
      expect(result?.defectType).toBe('Slub');
    });

    it('should send defectType as null when not provided', () => {
      service.createAnnotation(1, 5).subscribe();

      const req = httpMock.expectOne(`${BASE}/snapshot/1/annotations`);
      expect(req.request.body).toEqual({ sectionIndex: 5, defectType: null });
      req.flush({ ...FAKE_ANNOTATION, sectionIndex: 5, defectType: null });
    });
  });
});
