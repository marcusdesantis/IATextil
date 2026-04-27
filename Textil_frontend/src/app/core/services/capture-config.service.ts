import { Injectable } from '@angular/core';
import { InspectionService } from './inspection.service';
import { RulerPositionInfo } from '../../features/inspection/capture-defect-dialog.component';

export interface CaptureConfig {
  ringBufferSize: number;
  offsetFrames: number;
  frameCount: number;
  machineState: string;
}

const STORAGE_KEY = 'textil_capture_config';

const DEFAULTS: CaptureConfig = {
  ringBufferSize: 500,
  offsetFrames: 100,
  frameCount: 20,
  machineState: '',
};

@Injectable({ providedIn: 'root' })
export class CaptureConfigService {
  // User-editable settings (persisted in localStorage)
  config: CaptureConfig = { ...DEFAULTS };

  // Backend-served values (read-only, loaded once)
  imageSectionCount = 10;
  defectTypes: string[] = [];
  rulerPositions: RulerPositionInfo[] = [];
  cmPerFrame = 0.4;
  backendConfigLoaded = false;

  constructor(private inspectionService: InspectionService) {
    this.loadFromStorage();
  }

  loadBackendConfig(onLoaded?: () => void): void {
    if (this.backendConfigLoaded) {
      onLoaded?.();
      return;
    }
    this.inspectionService.getRulerConfig().subscribe({
      next: (cfg) => {
        this.imageSectionCount = cfg.imageSectionCount ?? 10;
        this.defectTypes = cfg.defectTypes ?? [];
        this.rulerPositions = cfg.positions ?? [];
        this.cmPerFrame = cfg.cmPerFrame ?? 0.4;
        this.backendConfigLoaded = true;
        onLoaded?.();
      },
      error: () => onLoaded?.(),
    });
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch { /* storage unavailable */ }
  }

  reset(): void {
    this.config = { ...DEFAULTS };
    this.save();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CaptureConfig>;
        this.config = { ...DEFAULTS, ...parsed };
      }
    } catch { /* corrupt storage — use defaults */ }
  }
}
