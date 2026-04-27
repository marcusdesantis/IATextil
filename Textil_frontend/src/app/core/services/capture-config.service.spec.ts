import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { CaptureConfigService } from './capture-config.service';
import { InspectionService } from './inspection.service';

// ── Fake ruler config returned by the backend ─────────────────────────────────

const FAKE_RULER_CONFIG = {
  defectTypes: ['Slub', 'Floats', 'Knot', 'Holes', 'Ladder'],
  imageSectionCount: 10,
  positionCount: 12,
  baseDistanceCm: 50,
  positionSpacingCm: 5,
  cmPerFrame: 0.4,
  positions: [
    { position: 1, distanceCm: 52.5, framesBack: 131 },
    { position: 12, distanceCm: 107.5, framesBack: 269 },
  ],
};

// ── Helper: build service with a controlled InspectionService spy ─────────────

function buildService(getRulerConfigReturn: any) {
  const inspectionSpy = jasmine.createSpyObj<InspectionService>(
    'InspectionService',
    ['getRulerConfig']
  );
  inspectionSpy.getRulerConfig.and.returnValue(getRulerConfigReturn);

  TestBed.configureTestingModule({
    providers: [
      CaptureConfigService,
      { provide: InspectionService, useValue: inspectionSpy },
    ],
  });

  return {
    service: TestBed.inject(CaptureConfigService),
    inspectionSpy,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('CaptureConfigService', () => {

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  // ── loadBackendConfig ───────────────────────────────────────────────────────

  describe('loadBackendConfig', () => {
    it('should populate defectTypes, rulerPositions and cmPerFrame from the backend', () => {
      const { service } = buildService(of(FAKE_RULER_CONFIG));

      service.loadBackendConfig();

      expect(service.defectTypes).toEqual(['Slub', 'Floats', 'Knot', 'Holes', 'Ladder']);
      expect(service.rulerPositions.length).toBe(2);
      expect(service.cmPerFrame).toBe(0.4);
      expect(service.imageSectionCount).toBe(10);
    });

    it('should set backendConfigLoaded to true after a successful load', () => {
      const { service } = buildService(of(FAKE_RULER_CONFIG));

      service.loadBackendConfig();

      expect(service.backendConfigLoaded).toBeTrue();
    });

    it('should call onLoaded callback after a successful load', () => {
      const { service } = buildService(of(FAKE_RULER_CONFIG));
      const onLoaded = jasmine.createSpy('onLoaded');

      service.loadBackendConfig(onLoaded);

      expect(onLoaded).toHaveBeenCalledOnceWith();
    });

    it('should NOT call the backend a second time when backendConfigLoaded is already true', () => {
      const { service, inspectionSpy } = buildService(of(FAKE_RULER_CONFIG));

      service.loadBackendConfig(); // first call — loads from backend
      service.loadBackendConfig(); // second call — should be skipped

      expect(inspectionSpy.getRulerConfig).toHaveBeenCalledTimes(1);
    });

    it('should still call onLoaded even when the HTTP request fails', () => {
      const { service } = buildService(throwError(() => new Error('Network error')));
      const onLoaded = jasmine.createSpy('onLoaded');

      service.loadBackendConfig(onLoaded);

      expect(onLoaded).toHaveBeenCalledOnceWith();
    });

    it('should leave defaults intact when HTTP request fails', () => {
      const { service } = buildService(throwError(() => new Error('Network error')));

      service.loadBackendConfig();

      expect(service.defectTypes).toEqual([]);
      expect(service.rulerPositions).toEqual([]);
    });
  });

  // ── save / reset ────────────────────────────────────────────────────────────

  describe('save', () => {
    it('should persist the current config to localStorage as JSON', () => {
      const { service } = buildService(of(FAKE_RULER_CONFIG));
      service.config.ringBufferSize = 300;
      service.config.frameCount = 40;

      service.save();

      const stored = JSON.parse(localStorage.getItem('textil_capture_config')!);
      expect(stored.ringBufferSize).toBe(300);
      expect(stored.frameCount).toBe(40);
    });
  });

  describe('reset', () => {
    it('should restore all config values to their defaults', () => {
      const { service } = buildService(of(FAKE_RULER_CONFIG));
      service.config.ringBufferSize = 999;
      service.config.offsetFrames = 999;

      service.reset();

      expect(service.config.ringBufferSize).toBe(500);
      expect(service.config.offsetFrames).toBe(100);
      expect(service.config.frameCount).toBe(20);
      expect(service.config.machineState).toBe('');
    });

    it('should persist the reset defaults to localStorage', () => {
      const { service } = buildService(of(FAKE_RULER_CONFIG));
      service.config.ringBufferSize = 999;

      service.reset();

      const stored = JSON.parse(localStorage.getItem('textil_capture_config')!);
      expect(stored.ringBufferSize).toBe(500);
    });
  });

  // ── localStorage persistence (constructor) ──────────────────────────────────

  describe('loadFromStorage (via constructor)', () => {
    it('should load a previously saved config from localStorage on init', () => {
      localStorage.setItem(
        'textil_capture_config',
        JSON.stringify({ ringBufferSize: 250, offsetFrames: 50, frameCount: 10, machineState: 'Test' })
      );

      const { service } = buildService(of(FAKE_RULER_CONFIG));

      expect(service.config.ringBufferSize).toBe(250);
      expect(service.config.offsetFrames).toBe(50);
      expect(service.config.machineState).toBe('Test');
    });

    it('should fall back to defaults when localStorage contains corrupt JSON', () => {
      localStorage.setItem('textil_capture_config', '{ not valid json %%');

      const { service } = buildService(of(FAKE_RULER_CONFIG));

      expect(service.config.ringBufferSize).toBe(500);
      expect(service.config.frameCount).toBe(20);
    });

    it('should use defaults when localStorage has no saved config', () => {
      // localStorage is already cleared in afterEach
      const { service } = buildService(of(FAKE_RULER_CONFIG));

      expect(service.config.ringBufferSize).toBe(500);
      expect(service.config.offsetFrames).toBe(100);
    });

    it('should merge saved values with defaults, preserving missing keys', () => {
      // Only ringBufferSize is saved — other fields should come from DEFAULTS
      localStorage.setItem(
        'textil_capture_config',
        JSON.stringify({ ringBufferSize: 800 })
      );

      const { service } = buildService(of(FAKE_RULER_CONFIG));

      expect(service.config.ringBufferSize).toBe(800);
      expect(service.config.frameCount).toBe(20);   // from DEFAULTS
      expect(service.config.offsetFrames).toBe(100); // from DEFAULTS
    });
  });
});
