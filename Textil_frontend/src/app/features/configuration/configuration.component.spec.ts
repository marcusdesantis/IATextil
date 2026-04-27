import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfigurationComponent } from './configuration.component';
import { CaptureConfigService } from '../../core/services/capture-config.service';

// ── Fake CaptureConfigService ─────────────────────────────────────────────────

function makeCfg(overrides: Partial<{ backendConfigLoaded: boolean }> = {}) {
  return {
    config: { ringBufferSize: 500, offsetFrames: 100, frameCount: 20, machineState: '' },
    backendConfigLoaded: overrides.backendConfigLoaded ?? false,
    imageSectionCount: 10,
    cmPerFrame: 0.4,
    rulerPositions: [{ position: 1 }, { position: 12 }],
    defectTypes: ['Slub', 'Knot'],
    loadBackendConfig: jasmine.createSpy('loadBackendConfig'),
    save: jasmine.createSpy('save'),
    reset: jasmine.createSpy('reset'),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ConfigurationComponent', () => {
  let fixture: ComponentFixture<ConfigurationComponent>;
  let cfg: ReturnType<typeof makeCfg>;
  let snackBarOpen: jasmine.Spy;

  async function setup(cfgOverrides: Parameters<typeof makeCfg>[0] = {}) {
    cfg = makeCfg(cfgOverrides);

    await TestBed.configureTestingModule({
      imports: [ConfigurationComponent],
      providers: [
        provideNoopAnimations(),
        { provide: CaptureConfigService, useValue: cfg },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigurationComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Access the component's private snackBar field to spy on the actual instance it uses
    snackBarOpen = spyOn((fixture.componentInstance as any).snackBar, 'open');
  }

  function el<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }
  function text(selector: string): string {
    return el(selector)?.textContent?.trim() ?? '';
  }
  function clickBtn(namePattern: RegExp): void {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const btn = buttons.find(b => namePattern.test(b.textContent ?? ''));
    btn?.click();
    fixture.detectChanges();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  it('should call loadBackendConfig on init', async () => {
    await setup();
    expect(cfg.loadBackendConfig).toHaveBeenCalledTimes(1);
  });

  it('should render the page heading', async () => {
    await setup();
    expect(text('h1')).toBe('Configuration');
  });

  // ── Editable fields ────────────────────────────────────────────────────────

  it('should render all four form fields', async () => {
    await setup();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('mat-label')) as HTMLElement[];
    const labelTexts = labels.map(l => l.textContent?.trim() ?? '');
    expect(labelTexts.some(t => /buffer size/i.test(t))).toBeTrue();
    expect(labelTexts.some(t => /default offset/i.test(t))).toBeTrue();
    expect(labelTexts.some(t => /frames each side/i.test(t))).toBeTrue();
    expect(labelTexts.some(t => /machine state/i.test(t))).toBeTrue();
  });

  it('should bind buffer size input to cfg.config.ringBufferSize', async () => {
    await setup();
    const inputs = fixture.nativeElement.querySelectorAll('input[type="number"]');
    expect((inputs[0] as HTMLInputElement).value).toBe('500');
  });

  // ── Save ───────────────────────────────────────────────────────────────────

  it('should call cfg.save() when Save settings is clicked', async () => {
    await setup();
    clickBtn(/save settings/i);
    expect(cfg.save).toHaveBeenCalledTimes(1);
  });

  it('should open snackbar with "Settings saved" after saving', async () => {
    await setup();
    clickBtn(/save settings/i);
    expect(snackBarOpen).toHaveBeenCalledWith(
      'Settings saved', 'Close', jasmine.objectContaining({ duration: 3000 })
    );
  });

  // ── Reset ──────────────────────────────────────────────────────────────────

  it('should call cfg.reset() when Reset to defaults is clicked', async () => {
    await setup();
    clickBtn(/reset to defaults/i);
    expect(cfg.reset).toHaveBeenCalledTimes(1);
  });

  it('should open snackbar with "Reset to defaults" after reset', async () => {
    await setup();
    clickBtn(/reset to defaults/i);
    expect(snackBarOpen).toHaveBeenCalledWith(
      'Reset to defaults', 'Close', jasmine.objectContaining({ duration: 3000 })
    );
  });

  // ── Backend config section ─────────────────────────────────────────────────

  it('should show loading text when backendConfigLoaded is false', async () => {
    await setup({ backendConfigLoaded: false });
    expect(fixture.nativeElement.textContent).toContain('Loading system configuration');
  });

  it('should show backend config values when backendConfigLoaded is true', async () => {
    await setup({ backendConfigLoaded: true });
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('10');   // imageSectionCount
    expect(content).toContain('0.4'); // cmPerFrame
    expect(content).toContain('2');   // rulerPositions.length
    expect(content).toContain('Slub');
    expect(content).toContain('Knot');
  });
});
